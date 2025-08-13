// utils/mapPostToOutput.js
const ta = require('time-ago');

const mapPostToOutput = (post, userId) => {
  return {
    _id: post._id,
    caption: post.caption,
    image: post.image,
    owner: {
      _id: post.owner._id,
      name: post.owner.name,
      avatar: post.owner.avatar
    },
    likesCount: post.likes.length,
    isLiked: post.likes.includes(userId),
    timeAgo: ta.ago(post.createdAt),
    comments: post.comments.map(c => ({
      _id: c._id,
      text: c.text,
      user: {
        _id: c.user?._id,
        name: c.user?.name,
        avatar: c.user?.avatar
      },
      createdAt: c.createdAt
    }))
  };
};

module.exports = mapPostToOutput;
