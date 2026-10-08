# Animated Exalted crest

The main homepage emblem and the desktop Timers & Events guild mark use `assets/exalted-crest-animated.mp4`. It was generated with Higgsfield Seedance 2.0 on October 8, 2026, at the user's explicit request. The existing `assets/exalted-crest-512.png` was supplied as both the first and final frame to preserve the guild identity.

The six-second silent loop uses moving gold reflections, an emerald glow and a top-star glint. The website delivery is 512 × 512, H.264/yuv420p, with the MP4 metadata at the front for quick playback. Original generation receipts and the full-resolution source are private working files under `output/exalted-emblem-higgsfield/` and must not be deployed.

`emblem.js` handles muted inline playback, the pause/play button, page visibility and viewport visibility. Video is loaded only when needed. Reduced-motion visits keep the original PNG without downloading the video; data-saving visits start paused. Either can explicitly opt in with the Play button. A new reduced-motion preference change revokes that opt-in. The PNG also remains available if playback or loading fails. Small navigation icons and sharing images remain static.

This is a user-requested Higgsfield video asset. The project's default for new still images remains ChatGPT imagegen.
