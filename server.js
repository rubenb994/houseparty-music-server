var app = require("express")();
var http = require("http").createServer(app);
var io = require("socket.io")(http);

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

io.on("connection", (socket) => {
  console.log("a user connected", socket.id);

  socket.on("new-choice", (choice) => {
    console.log("new choice from", choice);
  });
});

http.listen(3000, () => {
  console.log("listening on *:3000");
});
