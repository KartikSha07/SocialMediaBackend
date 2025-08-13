const authController = require("../controllers/authController");

const router = require("express").Router();


router.post('/signUp',authController.signUpController);
router.post('/login',authController.loginController);
router.get('/refresh',authController.refreshTokenController);
router.get('/logout',authController.logoutController);

module.exports = router;
