const Post = require("../models/postModel");
const User = require("../models/userModel");
const { success, failure: error } = require("../utils/responseStatus");
const mapPostToOutput = require("../utils/utils");
const cloudinary = require("cloudinary").v2;
const postMap = require("../utils/utils");
const mongoose = require("mongoose");

const followOrUnfollowUser = async (req, res) => {
  try {
    const { userIdToFollow } = req.body;
    const loggedInUser = req.id;

    const userToFollow = await User.findById(userIdToFollow);
    const currUser = await User.findById(loggedInUser);
    if (!userToFollow) {
      return res.status(404).json(error(404, "User not found"));
    }

    if (userIdToFollow === loggedInUser) {
      return res.status(409).json(error(409, "You can't follow yourself"));
    }

    if (currUser.followings.includes(userIdToFollow)) {
      console.log("inside ddd");

      const userIndex = currUser.followings.indexOf(userIdToFollow);
      currUser.followings.splice(userIndex, 1);

      const currUserIndex = userToFollow.followers.indexOf(loggedInUser);
      userToFollow.followers.splice(currUserIndex, 1);
    } else {
      currUser.followings.push(userToFollow);
      userToFollow.followers.push(currUser);
      
    }
    await currUser.save();
    await userToFollow.save();
    return res.send(success(200, {user : userToFollow}));
  } catch (e) {
    console.log(e);
    return res.send(error(500, e.message));
  }
};

const getFeedData = async (req, res) => {
  try {
    const currUser = await User.findById(req.id).populate("followings");

    const fullPosts = await Post.find({
      owner: { $in: currUser.followings },
    })
      .populate("owner")
      .populate("comments.user");

    const posts = fullPosts.map((post) => mapPostToOutput(post, req.id)).reverse();
    const followings = currUser.followings.map((user) => user._id);

    const suggestion = await User.find({
      _id: { $nin: followings, $ne: req.id },
    });

    return res.send(success(200, { ...currUser._doc, suggestion, posts }));
  } catch (e) {
    return res.send(error(500, e.message));
  }
};



const getCurrentUserPosts = async (req, res) => {
  try {
    const currUser = await User.findById(req.id);
    const posts = await Post.find({
      owner: currUser,
    }).populate("likes");
    return res.send(
      success(200, {
        currUser,
        posts,
      })
    );
  } catch (e) {
    console.log(e);
    return res.send(error(500, e.message));
  }
};
const getUsersPostsById = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.send(error(400, "UserId is required"));
    const currUser = await User.findById(userId);
    const posts = await Post.find({
      owner: currUser,
    }).populate("likes");
    return res.send(
      success(200, {
        currUser,
        posts,
      })
    );
  } catch (e) {
    console.log(e);
    return res.send(error(500, e.message));
  }
};

const removeCurrentUser = async (req, res) => {
  try {
    const userId = req.id;

    const currUser = await User.findById(userId);
    if (!currUser) return res.send(error(400, "User Not Found"));

    await Post.deleteMany({ owner: userId });

    // Remove the current user from followers' followings array
    for (const followerId of currUser.followers) {
      const follower = await User.findById(followerId);
      if (follower) {
        const userIndex = follower.followings.indexOf(userId);
        if (userIndex !== -1) {
          follower.followings.splice(userIndex, 1);
          await follower.save();
        }
      }
    }

    // Remove the current user from followings' followers array
    for (const followingId of currUser.followings) {
      const following = await User.findById(followingId);
      if (following) {
        const userIndex = following.followers.indexOf(userId);
        if (userIndex !== -1) {
          following.followers.splice(userIndex, 1);
          await following.save();
        }
      }
    }

    // Remove the current user from all posts' likes array
    const allPosts = await Post.find();
    for (const post of allPosts) {
      const likeIndex = post.likes.indexOf(userId);
      if (likeIndex !== -1) {
        post.likes.splice(likeIndex, 1);
        await post.save();
      }
    }

    // Finally, remove the current user
    await User.findByIdAndDelete(userId);

    res.clearCookie("jwt", {
      httpOnly: true,
      secure: true,
    });

    return res.send(
      success(204, {
        message: "User deleted successfully",
        deletedUser: currUser,
      })
    );
  } catch (e) {
    console.log(e);
    return res.send(error(500, e.message));
  }
};

const getMyInfo = async (req, res) => {
  try {
    const user = await User.findById(req.id);
    return res.send(
      success(200, {
        User: user,
      })
    );
  } catch (e) {
    res.send(error(500, e.message));
  }
};

const updateUser = async (req, res) => {
  try {
    const userId = req.id;
    const { name, bio, userImg } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.send(error(404, "User not found"));

    if (name) {
      user.name = name;
    }
    if (bio) {
      user.bio = bio;
    }
    if (userImg) {
      const uploadImg = await cloudinary.uploader.upload(userImg, {
        folder: "profileImg",
      });
      user.avatar = {
        public_id: uploadImg.public_id,
        url: uploadImg.secure_url,
      };
    }
    await user.save();
    return res.send(success(200, { User: user }));
  } catch (e) {
    return res.send(error(500, { mssg: e.message }));
  }
};

const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId).populate({
      path: "posts",
      populate: [
        { path: "owner" },
        { path: "comments.user" },
      ],
    });

    const fullPost = user.posts;
    const posts = fullPost.map((post) => mapPostToOutput(post, req.id)).reverse();

    return res.send(success(200, { ...user._doc, posts }));
  } catch (e) {
    return res.send(error(500, { mssg: e.message }));
  }
};

const searchUsers = async (req, res) => {
  try {
    const { query, page = 1, limit = 10 } = req.query;

    if (!query || !query.trim()) {
      return res.status(400).json(error(400, "Query parameter is required"));
    }

    // Partial, case-insensitive match
    const regex = new RegExp(query.trim(), "i");

    const aggregated = await User.aggregate([
      // Match users except the current user
      {
        $match: {
          name: regex,
          _id: { $ne: new mongoose.Types.ObjectId(req.id) }
        }
      },

      // Get detailed followers of the matched users
      {
        $lookup: {
          from: "users",
          localField: "followers",
          foreignField: "_id",
          as: "followersDetails"
        }
      },

      // Get current user's followings
      {
        $lookup: {
          from: "users",
          let: { currentUserId: new mongoose.Types.ObjectId(req.id) },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$currentUserId"] } } },
            { $project: { followings: 1 } }
          ],
          as: "currentUserData"
        }
      },

      // Flatten the followings
      {
        $addFields: {
          currentUserFollowing: {
            $ifNull: [
              { $arrayElemAt: ["$currentUserData.followings", 0] },
              []
            ]
          }
        }
      },

      // Get actual mutual follower objects
      {
        $addFields: {
          mutualFollowerObjs: {
            $filter: {
              input: "$followersDetails",
              as: "f",
              cond: { $in: ["$$f._id", "$currentUserFollowing"] }
            }
          }
        }
      },

      // Count mutual followers and extract 2 example names
      {
        $addFields: {
          mutualFollowers: { $size: "$mutualFollowerObjs" },
          mutualFollowerNames: {
            $map: {
              input: { $slice: ["$mutualFollowerObjs", 2] },
              as: "mf",
              in: "$$mf.name"
            }
          }
        }
      },

      // Sort by most mutuals first, then name
      { $sort: { mutualFollowers: -1, name: 1 } },

      // Pagination
      { $skip: (parseInt(page) - 1) * parseInt(limit) },
      { $limit: parseInt(limit) },

      // Only send required fields
      {
        $project: {
          name: 1,
          email: 1,
          avatar: 1,
          mutualFollowers: 1,
          mutualFollowerNames: 1
        }
      }
    ]);

    return res.status(200).json(success(200, aggregated));
  } catch (e) {
    console.error("SearchUsers error:", e);
    return res.status(500).json(error(500, "Internal Server Error"));
  }
};

// Get my followers
const getMyFollowers = async (req, res) => {
  try {
    const user = await User.findById(req.id).populate("followers", "name avatar");
    if (!user) return res.status(404).json({ status: "error", message: "User not found" });

    res.json({ status: "ok", result: user.followers });
  } catch (err) {
    console.error("Error fetching followers:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};

// Get my followings
const getMyFollowings = async (req, res) => {
  try {
    const user = await User.findById(req.id).populate("followings", "name avatar");
    if (!user) return res.status(404).json({ status: "error", message: "User not found" });

    res.json({ status: "ok", result: user.followings });
  } catch (err) {
    console.error("Error fetching followings:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select("name avatar bio email followers followings");

    if (!user) {
      return res.status(404).json(error(404, "User not found"));
    }

    return res.status(200).json(success(200, user));
  } catch (e) {
    console.error("getUserById error:", e);
    return res.status(500).json(error(500, "Internal Server Error"));
  }
};

module.exports = {
  followOrUnfollowUser,
  getFeedData,
  getCurrentUserPosts,
  getUsersPostsById,
  removeCurrentUser,
  getMyInfo,
  updateUser,
  getUserProfile,
  getMyFollowings,
  searchUsers,
  getMyFollowers,
  getUserById,
};
