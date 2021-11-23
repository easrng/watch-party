const setupChatboxEvents = (socket) => {
  // clear events by just reconstructing the form
  const oldChatForm = document.querySelector("#chatbox-send");
  const chatForm = oldChatForm.cloneNode(true);
  oldChatForm.replaceWith(chatForm);

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const input = chatForm.querySelector("input");
    const content = input.value;
    if (content.trim().length) {
      input.value = "";

      socket.send(
        JSON.stringify({
          op: "ChatMessage",
          data: content,
        })
      );
    }
  });
};

const fixChatSize = () => {
  const video = document.querySelector("video");
  const chatbox = document.querySelector("#chatbox");
  const chatboxContainer = document.querySelector("#chatbox-container");

  if (video && chatbox && chatboxContainer) {
    const delta = chatboxContainer.clientHeight - chatbox.clientHeight;

    chatbox.style["height"] = `calc(${
      window.innerHeight - video.clientHeight
    }px - ${delta}px - 1em)`;
  }
};

/**
 * @param {WebSocket} socket
 */
export const setupChat = async (socket) => {
  document.querySelector("#chatbox-container").style["display"] = "block";
  setupChatboxEvents(socket);

  fixChatSize();
  window.addEventListener("resize", () => {
    fixChatSize();
  });
};

const addToChat = (node) => {
  const chatbox = document.querySelector("#chatbox");
  chatbox.appendChild(node);
  chatbox.scrollTop = chatbox.scrollHeight;
};

let lastTimeMs = null;
let lastPlaying = false;

const checkDebounce = (event) => {
  let timeMs = null;
  let playing = null;
  if (event.op == "SetTime") {
    timeMs = event.data;
  } else if (event.op == "SetPlaying") {
    timeMs = event.data.time;
    playing = event.data.playing;
  }

  let shouldIgnore = false;

  if (timeMs != null) {
    if (lastTimeMs && Math.abs(lastTimeMs - timeMs) < 500) {
      shouldIgnore = true;
    }
    lastTimeMs = timeMs;
  }

  if (playing != null) {
    if (lastPlaying != playing) {
      shouldIgnore = false;
    }
    lastPlaying = playing;
  }

  return shouldIgnore;
};

/**
 * @param {string} eventType
 * @param {string?} user
 * @param {Node?} content
 */
const printChatMessage = (eventType, user, content) => {
  const chatMessage = document.createElement("div");
  chatMessage.classList.add("chat-message");
  chatMessage.classList.add(eventType);

  if (user != null) {
    const userName = document.createElement("strong");
    userName.textContent = user;
    chatMessage.appendChild(userName);
  }

  chatMessage.appendChild(document.createTextNode(" "));

  if (content != null) {
    chatMessage.appendChild(content);
  }

  addToChat(chatMessage);

  return chatMessage;
};

const formatTime = (ms) => {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (60 * 1000)) % 60);
  const hours = Math.floor((ms / (3600 * 1000)) % 3600);
  return `${hours < 10 ? "0" + hours : hours}:${
    minutes < 10 ? "0" + minutes : minutes
  }:${seconds < 10 ? "0" + seconds : seconds}`;
};

export const logEventToChat = (event) => {
  if (checkDebounce(event)) {
    return;
  }

  switch (event.op) {
    case "UserJoin": {
      printChatMessage(
        "user-join",
        event.user,
        document.createTextNode("joined")
      );
      break;
    }
    case "UserLeave": {
      printChatMessage(
        "user-leave",
        event.user,
        document.createTextNode("left")
      );
      break;
    }
    case "ChatMessage": {
      const messageContent = document.createElement("span");
      messageContent.classList.add("message-content");
      messageContent.textContent = event.data;
      printChatMessage("chat-message", event.user, messageContent);
      break;
    }
    case "SetTime": {
      const messageContent = document.createElement("span");
      messageContent.appendChild(document.createTextNode("set the time to "));

      messageContent.appendChild(
        document.createTextNode(formatTime(event.data))
      );

      printChatMessage("set-time", event.user, messageContent);
      break;
    }
    case "SetPlaying": {
      const messageContent = document.createElement("span");
      messageContent.appendChild(
        document.createTextNode(
          event.data.playing ? "started playing" : "paused"
        )
      );
      messageContent.appendChild(document.createTextNode(" at "));
      messageContent.appendChild(
        document.createTextNode(formatTime(event.data.time))
      );

      printChatMessage("set-playing", event.user, messageContent);

      break;
    }
  }
};