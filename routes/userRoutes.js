const userController = require("../controllers/userController");
const { authChecker } = require("../middleware/authMiddleware");
const router = require('express').Router();

router.post('/follow',authChecker,userController.followOrUnfollowUser);
router.get('/getFeedData',authChecker,userController.getFeedData);
router.get('/currentUserPosts',authChecker,userController.getCurrentUserPosts);
router.post('/getUsersPostsById',authChecker,userController.getUsersPostsById);
router.delete('/deleteUser',authChecker,userController.removeCurrentUser);
router.get('/getMyInfo',authChecker,userController.getMyInfo);
router.put('/updateUser',authChecker,userController.updateUser);
router.post('/getUserProfile',authChecker,userController.getUserProfile);
router.get('/myFollowings', authChecker, userController.getMyFollowings);
router.get("/search", authChecker, userController.searchUsers);
router.get("/myFollowers", authChecker, userController.getMyFollowers);
router.get('/:id', authChecker, userController.getUserById);


module.exports = router;