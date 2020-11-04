var app = require("express")();
var http = require("http").createServer(app);
var io = require("socket.io")(http);
const dotenv = require("dotenv");
dotenv.config();

var SpotifyWebApi = require("spotify-web-api-node");

// Spotify stuff below
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
});
const playlistId = "7K856YlxjAzxUIFuzRBsGa";
var availableTracks;
var usedTracks;

spotifyApi.clientCredentialsGrant().then(
  function (data) {
    // Save the access token so that it's used in future calls
    spotifyApi.setAccessToken(data.body["access_token"]);
    getSpotifyPlaylist();
  },
  function (err) {
    console.log("Something went wrong when retrieving an access token", err);
  }
);

function getSpotifyPlaylist() {
  spotifyApi.getPlaylist(playlistId).then(
    function (data) {
      availableTracks = data.body.tracks.items;
      // playRandomSong();
    },
    function (err) {
      console.log("Something went wrong!", err);
    }
  );
}

function playRandomSong() {
  spotifyApi.play().then(
    function () {
      console.log("Playback started");
    },
    function (err) {
      //if the user making the request is non-premium, a 403 FORBIDDEN response code will be returned
      console.log("Something went wrong!", err);
    }
  );
}

// Websockets stuff below
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
  console.log(process.env.CLIENT_ID);
  console.log("listening on *:3000");
});
