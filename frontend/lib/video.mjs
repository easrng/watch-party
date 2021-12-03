/**
 * @param {string} videoUrl
 * @param {{name: string, url: string}[]} subtitles
 */
const createVideoElement = (videoUrl, subtitles) => {
  const video = document.createElement("video");
  video.controls = true;
  video.autoplay = false;
  video.volume = 0.5;
  video.crossOrigin = "anonymous";

  const source = document.createElement("source");
  source.src = videoUrl;

  video.appendChild(source);

  let first = true;
  for (const { name, url } of subtitles) {
    const track = document.createElement("track");
    track.label = name;
    track.src = url;
    track.kind = "captions";

    if (first) {
      track.default = true;
      first = false;
    }

    video.appendChild(track);
  }

  // watch for attribute changes on the video object to detect hiding/showing of controls
  // as far as i can tell this is the least hacky solutions to get control visibility change events
  const observer = new MutationObserver(async (mutations) => {
    for (const mutation of mutations) {
      if (mutation.attributeName == "controls") {
        if (video.controls) {
          // enable media button support
          navigator.mediaSession.setActionHandler("play", null);
          navigator.mediaSession.setActionHandler("pause", null);
          navigator.mediaSession.setActionHandler("stop", null);
          navigator.mediaSession.setActionHandler("seekbackward", null);
          navigator.mediaSession.setActionHandler("seekforward", null);
          navigator.mediaSession.setActionHandler("seekto", null);
          navigator.mediaSession.setActionHandler("previoustrack", null);
          navigator.mediaSession.setActionHandler("nexttrack", null);
          navigator.mediaSession.setActionHandler("skipad", null);
        } else {
          // disable media button support by ignoring the events
          navigator.mediaSession.setActionHandler("play", () => { });
          navigator.mediaSession.setActionHandler("pause", () => { });
          navigator.mediaSession.setActionHandler("stop", () => { });
          navigator.mediaSession.setActionHandler("seekbackward", () => { });
          navigator.mediaSession.setActionHandler("seekforward", () => { });
          navigator.mediaSession.setActionHandler("seekto", () => { });
          navigator.mediaSession.setActionHandler("previoustrack", () => { });
          navigator.mediaSession.setActionHandler("nexttrack", () => { });
          navigator.mediaSession.setActionHandler("skipad", () => { });
        }
        return;
      }
    }
  });
  observer.observe(video, { attributes: true });

  return video;
};

/**
 * @param {string} videoUrl
 * @param {{name: string, url: string}[]} subtitles
 * @param {number} currentTime
 * @param {boolean} playing
 */
export const setupVideo = async (videoUrl, subtitles, currentTime, playing) => {
  document.querySelector("#pre-join-controls").style["display"] = "none";
  const video = createVideoElement(videoUrl, subtitles);
  document.querySelector("#video-container").appendChild(video);

  video.currentTime = currentTime / 1000.0;

  try {
    if (playing) {
      await video.play();
    } else {
      video.pause();
    }
  } catch (err) {
    // Auto-play is probably disabled, we should uhhhhhhh do something about it
  }

  return video;
};
