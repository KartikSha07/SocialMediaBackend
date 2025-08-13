const axios = require("axios");

exports.searchYouTubeVideos = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.status(400).json({ status: "error", message: "Query parameter 'q' is required" });
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    const response = await axios.get("https://www.googleapis.com/youtube/v3/search", {
      params: {
        part: "snippet",
        q,
        maxResults: 15,
        type: "video",
        key: apiKey,
      },
    });

    res.json({ status: "ok", result: response.data.items });
  } catch (e) {
    console.error("YouTube search error:", e.message);
    res.status(500).json({ status: "error", message: "Failed to fetch from YouTube API" });
  }
};
