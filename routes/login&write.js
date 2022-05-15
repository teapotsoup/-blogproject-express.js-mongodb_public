var router = require('express').Router();


function loginCheck(req, res, next) {
  if (req.user) {
    next(); //로그인 안하면 안나온다
  } else {
    res.send("로그인을 해야 접속이 가능합니다.");
  }
}

// router.use(loginCheck);
// 하단의 모든 라우터에 미들웨어 적용해줌

router.use("/write", loginCheck);
// 특정 라우터에 미들웨어 적용해줌

router.get("/", function (req, res) {
  res.render("login");
});

router.get("/write", function (req, res) {
  res.render("write");
});


module.exports = router;