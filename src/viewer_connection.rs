use once_cell::sync::Lazy;
use std::{
    collections::HashMap,
    sync::atomic::{AtomicUsize, Ordering},
};

use futures::{SinkExt, StreamExt, TryFutureExt};
use tokio::sync::{
    mpsc::{self, UnboundedSender},
    RwLock,
};
use tokio_stream::wrappers::UnboundedReceiverStream;

use uuid::Uuid;
use warp::ws::{Message, WebSocket};

use crate::{
    events::WatchEvent,
    watch_session::{get_session, handle_watch_event},
};

static CONNECTED_VIEWERS: Lazy<RwLock<HashMap<usize, ConnectedViewer>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));
static NEXT_VIEWER_ID: AtomicUsize = AtomicUsize::new(1);

pub struct ConnectedViewer {
    pub session: Uuid,
    pub viewer_id: usize,
    pub tx: UnboundedSender<WatchEvent>,
}

pub async fn ws_subscribe(session_uuid: Uuid, nickname: String, ws: WebSocket) {
    let viewer_id = NEXT_VIEWER_ID.fetch_add(1, Ordering::Relaxed);
    let (mut viewer_ws_tx, mut viewer_ws_rx) = ws.split();

    let (tx, rx) = mpsc::unbounded_channel::<WatchEvent>();
    let mut rx = UnboundedReceiverStream::new(rx);

    tokio::task::spawn(async move {
        while let Some(event) = rx.next().await {
            viewer_ws_tx
                .send(Message::text(
                    serde_json::to_string(&event).expect("couldn't convert WatchEvent into JSON"),
                ))
                .unwrap_or_else(|e| eprintln!("ws send error: {}", e))
                .await;
        }
    });

    CONNECTED_VIEWERS.write().await.insert(
        viewer_id,
        ConnectedViewer {
            viewer_id,
            session: session_uuid,
            tx,
        },
    );

    ws_publish(session_uuid, None, WatchEvent::UserJoin(nickname.clone())).await;

    while let Some(Ok(message)) = viewer_ws_rx.next().await {
        let mut event: WatchEvent = match message
            .to_str()
            .ok()
            .and_then(|s| serde_json::from_str(s).ok())
        {
            Some(e) => e,
            None => continue,
        };

        // Make sure people don't spoof their nicknames to pretend to be others
        // If a nickname change is required, I guess reconnect idk
        if let WatchEvent::ChatMessage { user: _, message } = event {
            event = WatchEvent::ChatMessage {
                user: nickname.clone(),
                message,
            };

            // Don't pass through the viewer_id because we want the chat message
            // to be reflected to the user.
            ws_publish(session_uuid, None, event).await;

            // We don't need to handle() chat messages,
            // and we are already publishing them ourselves.
            continue;
        }

        handle_watch_event(
            session_uuid,
            &mut get_session(session_uuid).unwrap(),
            event.clone(),
        );

        ws_publish(session_uuid, Some(viewer_id), event).await;
    }

    ws_publish(session_uuid, None, WatchEvent::UserLeave(nickname.clone())).await;

    CONNECTED_VIEWERS.write().await.remove(&viewer_id);
}

pub async fn ws_publish(session_uuid: Uuid, viewer_id: Option<usize>, event: WatchEvent) {
    for viewer in CONNECTED_VIEWERS.read().await.values() {
        if viewer_id == Some(viewer.viewer_id) {
            continue;
        }

        if viewer.session != session_uuid {
            continue;
        }

        let _ = viewer.tx.send(event.clone());
    }
}