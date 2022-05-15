const express = require("express"),
  nunjucks = require("nunjucks");

const app = express();
const MongoClient = require("mongodb").MongoClient;
const methodOverride = require("method-override");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const session = require("express-session");
const mongoose = require("mongoose"); //오브젝트 아이디 형 변환용
const Cryptr = require("cryptr");
const cryptr = new Cryptr("myTotalySecretKey");

const http = require("http").createServer(app);
const { Server } = require("socket.io");
const io = new Server(http);
const querystring = require("querystring");

require("dotenv").config();

// 시간 설정 관련 시작
const today = new Date();
const year = today.getFullYear();
const month = ("0" + (today.getMonth() + 1)).slice(-2);
const day = ("0" + today.getDate()).slice(-2);
const dateString = year + "-" + month + "-" + day;
const hours = ("0" + today.getHours()).slice(-2);
const minutes = ("0" + today.getMinutes()).slice(-2);
const seconds = ("0" + today.getSeconds()).slice(-2);
const timeString = hours + ":" + minutes + ":" + seconds;
// 시간 설정 관련 끝

app.use(
  session({ secret: "비밀코드", resave: true, saveUninitialized: false })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(methodOverride("_method"));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname + "/public"));

app.set("view engine", "html");
nunjucks.configure("views", {
  express: app,
  watch: true,
});

MongoClient.connect(process.env.DB_URL, function (err, client) {
  if (err) {
    console.log(err);
  }
  const db = client.db("todoapp");

  app.get("/detail/:id", function (req, res) {
    console.log(req.params.id);
    db.collection("post").findOne(
      { _id: parseInt(req.params.id) },
      function (err, result) {
        // console.log(result);
        result.writerId = result.writerId.toString();
        res.render("detail", {
          result:result,
          id: parseInt(req.params.id),
          userId: req.user._id
        });
      }
    );
  });
  app.get("/edit/:id", function (req, res) {
    //게시글 별로 페이지를 보여주도록 :id를 붙인다
    db.collection("post").findOne(
      { _id: parseInt(req.params.id) },
      function (err, result) {
        //parseInt(req.params.id)로 url의 :id 부분을 정수로 바꾼후 DB의 post란 콜렉션에 해당 _id가 있는지 찾는다
        res.render("edit", { post: result }); //데이터 바인딩을 위해 결과값을 변수에 할당하고 랜더링한다
      }
    );
  });
  // app.delete("/delete", function (req, res) {
  //   req.body._id = parseInt(req.body._id);
  //   const deleteData = { _id: req.body._id, writerId: req.user._id };
  //   db.collection("post").deleteOne(deleteData, function (err, result) {
  //     console.log("삭제완료");
  //     res.status(200).send({ message: "성공했습니다" });
  //   });
  // });

  app.get("/delete/:id", function (req, res) {
    const deleteData = { _id:parseInt(req.params.id), writerId: req.user._id };
    db.collection("post").deleteOne(deleteData,function (err, result) {
        res.render("list"); //데이터 바인딩을 위해 결과값을 변수에 할당하고 랜더링한다
      }
    );
  });

  app.get("/mypage", loginCheck, function (req, res) {
    const decryptedString = cryptr.decrypt(req.user.pw);
    res.render("mypage", { myuser: req.user, decryptedPw: decryptedString }); //사용자의 정보가 뜬다
  });

  app.put("/mypage", loginCheck, function (req, res) {
    const encryptedpassWord = cryptr.encrypt(req.body.pw);
    db.collection("login").updateOne(
      { _id: mongoose.Types.ObjectId(req.body._id) },
      { $set: { identity: req.body.identity, pw: encryptedpassWord } },
      function (err, result) {
        if (err) {
          console.log(err);
        }
        res.redirect("/login");
      }
    );
  });
  app.delete("/mypage", loginCheck, function (req, res) {
    req.body._id = mongoose.Types.ObjectId(req.body._id);
    db.collection("login").deleteOne(req.body, function (err, result) {
      if (err) {
        console.log(err);
      }
      console.log("삭제완료");
      res.redirect("/login");
    });
  });

  app.get("/login", function (req, res) {
    res.render("login");
  });

  app.post("/login/", function (req, res, next) {
    passport.authenticate("local", function (err, user, info) {
      if (err) {
        return next(err);
      }
      if (!user) {
        res.redirect("/login");
        // const query = querystring.stringify({
        //   valid: "true",
        // });
        // res.redirect("/login" + query);
      }
      req.logIn(user, function (err) {
        if (err) {
          return next(err);
        }
        req.session.save(function () {
          res.redirect("/mypage");
        });
      });
    })(req, res, next);
  });

  app.get("/logout", function (req, res) {
    req.logout();
    req.session.save(function () {
      res.redirect("/");
    });
  });

  app.get("/search", function (req, res) {
    let searchConditions = [
      {
        $search: {
          index: "titleSearch",
          text: {
            query: req.query.value, //입력된 키워드 정상 출력
            path: "title", // 제목날짜 둘다 찾고 싶으면 ['제목', '날짜']
          },
        },
      },
      // {$sort : {_id:-1}}, //_id:1 오름차순으로 결과 출력 -1은 내림차순 결과 출력
      // {$limit : 2},
      { $project: { title: 1, _id: 0, score: { $meta: "searchScore" } } },
    ];
    db.collection("post")
      .aggregate(searchConditions)
      .toArray(function (err, result) {
        res.render("search", { posts: result });
      });
  });
  // app.get('/search', (req, res)=>{
  //   console.log(req.query);
  //   db.collection('post').find({title : req.query.value}).toArray((err, result)=>{
  //     res.render("search", { posts: result });
  //   })
  // })
  //인증 방법 Strategy
  passport.use(
    new LocalStrategy(
      {
        usernameField: "id", //name 속성에 쓴대로 쓰기
        passwordField: "password",
        session: true,
        passReqToCallback: false,
      },
      function (insertId, insertPw, done) {
        // 해당 콜백함수는 사용자가 입력한 아이디 비번을 db의 정보와 대조하는 부분
        db.collection("login").findOne(
          { identity: insertId },
          function (err, result) {
            if (err) return done(err);

            if (!result)
              return done(null, false, {
                message: "존재하지않는 아이디/비밀번호",
              });
            if (insertPw == cryptr.decrypt(result.pw)) {
              //insertPw == crypter.decrypt(enc,key)
              return done(null, result);
            } else {
              return done(null, false, {
                message: "아이디나 비밀번호가 틀립니다",
              });
            }
          }
        );
      }
    )
  );

  passport.serializeUser(function (user, done) {
    done(null, user.identity);
  });

  passport.deserializeUser(function (id, done) {
    db.collection("login").findOne({ identity: id }, function (err, result) {
      done(null, result);
    });
  });

  app.get("/signup", function (req, res) {
    res.render("signup");
  });

  app.post("/signup", function (req, res) {
    const idWord = req.body.id;
    const passWord = req.body.password;
    const encryptedpassWord = cryptr.encrypt(passWord);

    var regType1 = /^[A-Za-z0-9+]{4,12}$/; //영문자(소/대), 숫자만 4~12
    if (regType1.test(idWord)) {
      db.collection("login").findOne(
        { identity: idWord },
        function (err, result) {
          if (result) {
            res.render("login", { idExists: "true" });
          } else {
            //비번 저장 전 암호화 여부
            db.collection("login").insertOne(
              {
                identity: idWord,
                pw: encryptedpassWord,
              },
              function (err, result) {
                res.redirect("/login");
                //안나옴
                // console.log(req.user);
                // const decryptedString = cryptr.decrypt(req.user.pw);
                // console.log(decryptedString);
                //여기다가 쇼부를 본다.
              }
            );
          }
        }
      );
    } else {
      res.render("login", { wrongType: "true" });
    }
  });
  //수제 미들웨어 쓰는 법

  //미들웨어 만들기
  function loginCheck(req, res, next) {
    if (req.user) {
      next(); //로그인 안하면 안나온다
    } else {
      res.send("로그인을 해야 접속이 가능합니다");
    }
  }

  app.post("/newpost", function (req, res) {
    db.collection("counter").findOne(
      { name: "postingCount" },
      function (err, result) {
        let totalPostCount = result.totalPost;
        console.log(`req.body.title는 ${req.body.title.length} 글자`);
        console.log(
          `req.body.description는 ${req.body.description.length} 글자`
        );

        if (
          parseInt(req.body.title.length) < 2 ||
          parseInt(req.body.description.length) < 2
        ) {
          res.send("<script>alert('제목과 내용 모두 두글자 넘어야 합니다.');location.href='/write';</script>");
          // res.redirect("/write");
          // res.render("write", { wrongType: "true" });
        } else {
          const saveData = {
            _id: totalPostCount + 1,
            title: req.body.title,
            description: req.body.description,
            dateNow: `${dateString} ${timeString}`,
            writerId: req.user._id,
            writerName: req.user.identity,
          };
          db.collection("post").insertOne(saveData, function (err, result) {
            if (err) {
              console.log(err);
            }
            console.log("저장완료");
            db.collection("counter").updateOne(
              { name: "postingCount" },
              { $inc: { totalPost: 1 } },
              function () {
                res.redirect("/list");
              }
            );
          });
        }
      }
    );
  });
  app.delete("/delete", function (req, res) {
    req.body._id = parseInt(req.body._id);
    const deleteData = { _id: req.body._id, writerId: req.user._id };
    db.collection("post").deleteOne(deleteData, function (err, result) {
      console.log("삭제완료");
      res.status(200).send({ message: "성공했습니다" });
    });
  });

  //put요청시
  app.put("/edit", function (req, res) {
    db.collection("post").updateOne(
      //updateOne( 1.업데이트할게시물찾기, 2.수정할내용, 3.콜백함수)
      // 각 컴포넌트의 name속성에 쓴 값에 해당하는 것들을 불러온다
      { _id: parseInt(req.body.id), writerId: req.user._id },
      { $set: { title: req.body.title, description: req.body.description } },
      function (err, result) {
        console.log("수정완료");
        res.redirect("/list");
      }
    );
  });

  app.get("/list", function (req, res) {
    db.collection("post")
      .find()
      .toArray(function (err, result) {
        result.forEach((e) => {
          e.writerId = e.writerId.toString();
        });
        res.render("list", { posts: result, userId: req.user._id });
      });
  });
  app.use("/", require("./routes/login&write"));

  app.get("/chat", loginCheck, function (req, res) {
    console.log(typeof req.user._id);
    req.user._id = req.user._id.toString(); //자료형이 오브젝트인 req.user._id를 스트링으로 바꿔줌
    db.collection("chatroom")
      .find({ member: req.user._id })
      .toArray()
      .then((result) => {
        res.render("chat", { posts: result });
      });
  });

  app.post("/chat/:id", loginCheck, function (req, res) {
    const saveData = {
      member: [req.body.writerId, req.user._id.toString()],
      date: `${dateString} ${timeString}`,
      title:
        parseInt(req.body.postNum) + "번 " + req.body.postTitle + " 채팅방",
    };
    db.collection("chatroom").insertOne(saveData, function (err, result) {
      if (err) {
        console.log(err);
      }
      console.log("채팅방 저장완료");
    });
  });

  app.post("/message", loginCheck, function (req, res) {
    const data = {
      parent: req.body.parent, //제이쿼리로 전송된 정보 바디에서 꺼내옴
      content: req.body.content,
      userid: req.user._id, //메세지 발행한 유저.로그인한 사용자 정보
      date: `${dateString} ${timeString}`,
    };

    db.collection("message")
      .insertOne(data)
      .then(() => {
        console.log("DB저장성공");
        res.send("DB저장성공");
      });
  });

  app.get("/message/:id", loginCheck, function (req, res) {
    res.writeHead(200, {
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    });
    db.collection("message")
      .find({ parent: req.params.id }) //req.params.id는message 콜렉션의 parent필드
      .toArray()
      .then((result) => {
        res.write("event: test\n");
        res.write("data: " + JSON.stringify(result) + "\n\n");
      });
    console.log(req.params.id);
    const pipeline = [
      { $match: { "fullDocument.parent": req.params.id } }, //req.params.id는message 콜렉션의 parent필드
    ];
    const changeStream = db.collection("message").watch(pipeline);
    changeStream.on("change", (result) => {
      res.write("event: test\n"); //이벤트 명 정하기
      // console.log(JSON.stringify([result.fullDocument]));
      res.write("data: " + JSON.stringify([result.fullDocument]) + "\n\n");
    });
  });
  app.get("/socket", function (req, res) {
    res.render("socket");
  });

  io.on("connection", function (socket) {
    console.log("유저 소켓 접속");

    socket.on("room1-send", function (data) {
      io.to("room1").emit("broadcast", `${data}`);
    });
    socket.on("joinroom", function () {
      socket.join("room1");
      // 유저를 특정 방에 들어가게 해주는 코드
    });
    socket.on("user-send", function (data) {
      //유저가 메세지 보내면
      io.emit("broadcast", `반가워 ${data}`); //모든 사람에게 보내줌
      //io.to(socket.id).emit('broadcast', `반가워 ${data}`)
      //접속한 특정 유저 id와 대화
      //이 코드의 경우 자기가 자기랑 대화하게 된다.
    });
  });
  http.listen(8080, function () {
    console.log("listening on 8080");
  });
});

let multer = require("multer");
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./public/image");
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

var upload = multer({ storage: storage });

app.get("/upload", function (req, res) {
  res.render("upload");
});

app.post("/upload", upload.single("profile"), function (req, res) {
  res.send("업로드 완료");
});

//upload.single('profile', 10)하면 파일 여러개 업로드 가능

app.get("/image/:imageName", function (req, res) {
  res.sendFile(__dirname + "/public/image/" + req.params.imageName);
});
