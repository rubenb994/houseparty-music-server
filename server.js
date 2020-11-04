var app = require("express")();
var http = require("http").createServer(app);
var io = require("socket.io")(http);

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

io.on("connection", (socket) => {
  console.log(`User ${socket.id} connected`);

  socket.on("new-choice", (choice) => {
    console.log(choice, " form ", socket.id);

    socket.broadcast.emit("new-choice", choice);
  });
});

http.listen(3000, () => {
  console.log("listening on *:3000");
});
