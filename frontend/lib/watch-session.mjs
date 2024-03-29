import { setupVideo } from "./video.mjs?v=9";
import { setupChat, logEventToChat, updateViewerList } from "./chat.mjs?v=9";
import ReconnectingWebSocket from "./reconnecting-web-socket.mjs";

/**
 * @param {string} sessionId
 * @param {string} nickname
 * @returns {ReconnectingWebSocket}
 */
const createWebSocket = (sessionId, nickname, colour) => {
  const wsUrl = new URL(
    `/sess/${sessionId}/subscribe` +
      `?nickname=${encodeURIComponent(nickname)}` +
      `&colour=${encodeURIComponent(colour)}`,
    window.location.href
  );
  wsUrl.protocol = "ws" + window.location.protocol.slice(4);
  const socket = new ReconnectingWebSocket(wsUrl);

  return socket;
};

let outgoingDebounce = false;
let outgoingDebounceCallbackId = null;

export const setDebounce = () => {
  outgoingDebounce = true;

  if (outgoingDebounceCallbackId) {
    cancelIdleCallback(outgoingDebounceCallbackId);
    outgoingDebounceCallbackId = null;
  }

  outgoingDebounceCallbackId = setTimeout(() => {
    outgoingDebounce = false;
  }, 500);
};

export const setVideoTime = (time, video = null) => {
  if (video == null) {
    video = document.querySelector("video");
  }

  const timeSecs = time / 1000.0;
  if (Math.abs(video.currentTime - timeSecs) > 0.5) {
    video.currentTime = timeSecs;
  }
};

export const setPlaying = async (playing, video = null) => {
  if (video == null) {
    video = document.querySelector("video");
  }

  if (playing) {
    await video.play();
  } else {
    video.pause();
  }
};

/**
 * @param {HTMLVideoElement} video
 * @param {ReconnectingWebSocket} socket
 */
const setupIncomingEvents = (video, socket) => {
  socket.addEventListener("message", async (messageEvent) => {
    try {
      const event = JSON.parse(messageEvent.data);

      if (!event.reflected) {
        switch (event.op) {
          case "SetPlaying":
            setDebounce();

            if (event.data.playing) {
              await video.play();
            } else {
              video.pause();
            }

            setVideoTime(event.data.time, video);
            break;
          case "SetTime":
            setDebounce();
            setVideoTime(event.data, video);
            break;
          case "UpdateViewerList":
            updateViewerList(event.data);
            break;
        }
      }

      logEventToChat(event);
    } catch (_err) {}
  });
};

/**
 * @param {HTMLVideoElement} video
 * @param {ReconnectingWebSocket} socket
 */
const setupOutgoingEvents = (video, socket) => {
  const currentVideoTime = () => (video.currentTime * 1000) | 0;

  video.addEventListener("pause", async (event) => {
    if (outgoingDebounce || !video.controls) {
      return;
    }

    // don't send a pause event for the video ending
    if (video.currentTime == video.duration) {
      return;
    }

    socket.send(
      JSON.stringify({
        op: "SetPlaying",
        data: {
          playing: false,
          time: currentVideoTime(),
        },
      })
    );
  });

  video.addEventListener("play", (event) => {
    if (outgoingDebounce || !video.controls) {
      return;
    }

    socket.send(
      JSON.stringify({
        op: "SetPlaying",
        data: {
          playing: true,
          time: currentVideoTime(),
        },
      })
    );
  });

  let firstSeekComplete = false;
  video.addEventListener("seeked", async (event) => {
    if (!firstSeekComplete) {
      // The first seeked event is performed by the browser when the video is loading
      firstSeekComplete = true;
      return;
    }

    if (outgoingDebounce || !video.controls) {
      return;
    }

    socket.send(
      JSON.stringify({
        op: "SetTime",
        data: {
          to: currentVideoTime(),
        },
      })
    );
  });
};

/**
 * @param {string} nickname
 * @param {string} sessionId
 */
export const joinSession = async (nickname, sessionId, colour) => {
  // try { // we are handling errors in the join form.
  const genericConnectionError = new Error(
    "There was an issue getting the session information."
  );
  window.location.hash = sessionId;
  let response, video_url, subtitle_tracks, current_time_ms, is_playing;
  try {
    response = await fetch(`/sess/${sessionId}`);
  } catch (e) {
    console.error(e);
    throw genericConnectionError;
  }
  if (!response.ok) {
    let error;
    try {
      ({ error } = await response.json());
      if (!error) throw new Error();
    } catch (e) {
      console.error(e);
      throw genericConnectionError;
    }
    throw new Error(error);
  }
  try {
    ({ video_url, subtitle_tracks, current_time_ms, is_playing } =
      await response.json());
  } catch (e) {
    console.error(e);
    throw genericConnectionError;
  }

  const socket = createWebSocket(sessionId, nickname, colour);
  socket.addEventListener("open", async () => {
    const video = await setupVideo(
      video_url,
      subtitle_tracks,
      current_time_ms,
      is_playing
    );

    // By default, we should disable video controls if the video is already playing.
    // This solves an issue where Safari users join and seek to 00:00:00 because of
    // outgoing events.
    if (current_time_ms != 0) {
      video.controls = false;
    }

    setupOutgoingEvents(video, socket);
    setupIncomingEvents(video, socket);
    setupChat(socket);
  });
  socket.addEventListener("reconnecting", (e) => {
    console.log("Reconnecting...");
  });
  socket.addEventListener("reconnected", (e) => {
    console.log("Reconnected.");
  });
  //} catch (e) {
  //  alert(e.message)
  //}
};

/**
 * @param {string} videoUrl
 * @param {Array} subtitleTracks
 */
export const createSession = async (videoUrl, subtitleTracks) => {
  const { id } = await fetch("/start_session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      video_url: videoUrl,
      subtitle_tracks: subtitleTracks,
    }),
  }).then((r) => r.json());

  window.location = `/?created=true#${id}`;
};
