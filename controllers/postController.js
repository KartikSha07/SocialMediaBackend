const { success, failure: error } = require("../utils/responseStatus");
const Post = require("../models/postModel");
const User = require("../models/userModel");
const mapPostToOutput = require("../utils/utils");
const cloudinary = require("cloudinary").v2;


const createPost = async function (req, res) {
  try {
    const { caption, postImg } = req.body;

    if (!caption || !postImg) {
      return res.send(error(400, "Caption and postImg are required"));
    }
    const cloudImg = await cloudinary.uploader.upload(postImg, {
      folder: "postImg",
    });

    const owner = req.id;

    const user = await User.findById(req.id);

    const post = await Post.create({
      owner,
      caption,
      image: {
        publicId: cloudImg.public_id,
        url: cloudImg.url,
      },
    });

    user.posts.push(post._id);
    await user.save();

    console.log("user", user);
    console.log("post", post);

    return res.json(success(200, { post }));
  } catch (e) {
    return res.json(error(500, e.message));
  }
};

const likeAndUnlikePosts = async function (req, res) {
  try {
    const { PostId } = req.body;
    const userId = req.id;
    const io = req.app.get("io");

    let post = await Post.findById(PostId)
      .populate("owner")
      .populate("comments.user");

    if (!post) return res.json(error(404, "Post not found"));

    if (post.likes.includes(userId)) {
      post.likes = post.likes.filter((id) => id.toString() !== userId);
    } else {
      post.likes.push(userId);
    }

    await post.save();

    post = await Post.findById(PostId)
      .populate("owner")
      .populate("comments.user");
    const postIdStr = PostId.toString();
    io.to(postIdStr).emit("postLiked", {
      postId: postIdStr,
      likesCount: post.likes.length,
      likes: post.likes, // array of user IDs
    });

    return res.json(success(200, { post: mapPostToOutput(post, userId) }));
  } catch (e) {
    return res.json(error(500, e.message));
  }
};

const updatePost = async function (req, res) {
  try {
    const { PostId, caption } = req.body;
    const owner = req.id;

    const post = await Post.findById(PostId);

    if (!post) {
      return res.json(error(404, "Post not found"));
    }

    if (post.owner.toString() !== owner) {
      return res.json(error(403, "You are not allowed to update this post"));
    }

    post.caption = caption;
    await post.save();
    return res.json(
      success(201, {
        message: "Post updated successfully",
        updatedPost: post,
      })
    );
  } catch (e) {
    return res.json(error(500, e.message));
  }
};

const deletePost = async function (req, res) {
  try {
    const { PostId } = req.body;
    const owner = req.id;
    const post = await Post.findById(PostId);
    if (!post) {
      return res.json(error(404, "Post not found"));
    }
    if (post.owner.toString() !== owner) {
      return res.json(error(403, "You are not allowed to delete this post"));
    }
    await Post.findByIdAndDelete(PostId);
    const currUser = await User.findById(owner);
    const postIndex = currUser.posts.indexOf(post);
    currUser.posts.splice(postIndex, 1);
    await currUser.save();

    return res.json(
      success(200, {
        message: "Post deleted successfully",
        deletedPost: post,
        allPost: currUser.posts,
      })
    );
  } catch (e) {
    return res.json(error(500, e.message));
  }
};

// controllers/postController.js

const addComment = async (req, res) => {
  try {
    const { postId, text } = req.body;
    const userId = req.id;
    const io = req.app.get("io");

    if (!postId || !text)
      return res.send(error(400, "PostId and Text are required"));

    let post = await Post.findById(postId);
    if (!post) return res.send(error(404, "Post not found"));

    // Add new comment subdoc
    post.comments.push({ user: userId, text, createdAt: new Date() });
    await post.save();

    // Re-fetch with population
    post = await Post.findById(postId)
      .populate("owner")
      .populate("comments.user");

    // Emit to correct room, always pass string id!
    const lastComment = post.comments[post.comments.length - 1];
    io.to(postId.toString()).emit("newComment", {
      postId: postId.toString(),
      comment: lastComment,
    });

    return res.send(success(201, { comments: post.comments }));
  } catch (e) {
    return res.send(error(500, e.message));
  }
};

const deleteComment = async (req, res) => {
  try {
    const { postId, commentId } = req.body;
    const userId = req.id;
    const io = req.app.get("io");

    let post = await Post.findById(postId);
    if (!post) return res.send(error(404, "Post not found"));

    // Find the comment
    const comment = post.comments.find(
      (c) => c._id.toString() === commentId.toString()
    );
    if (!comment) return res.send(error(404, "Comment not found"));
    if (comment.user.toString() !== userId)
      return res.send(error(403, "Not allowed to delete"));

    // Remove by filtering
    post.comments = post.comments.filter(
      (c) => c._id.toString() !== commentId.toString()
    );
    await post.save();

    // Re-fetch & populate users
    post = await Post.findById(postId)
      .populate("owner")
      .populate("comments.user");

    // Emit to correct room, always pass string id!
    io.to(postId.toString()).emit("commentDeleted", {
      postId: postId.toString(),
      commentId: commentId.toString(),
    });

    return res.send(success(200, { comments: post.comments }));
  } catch (e) {
    return res.send(error(500, e.message));
  }
};

module.exports = {
  updatePost,
  deletePost,
  createPost,
  likeAndUnlikePosts,
  addComment,
  deleteComment,
};
