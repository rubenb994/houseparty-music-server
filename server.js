var app = require("express")();
var http = require("http").createServer(app);
var io = require("socket.io")(http);
const dotenv = require("dotenv");
dotenv.config();
var SpotifyWebApi = require("spotify-web-api-node");

const playlistId = "7K856YlxjAzxUIFuzRBsGa";
var availableTracks;
var usedTracks;
const redirectUri = "http://localhost:3000/callback";
const scopes = [
  "user-read-private",
  "user-read-email",
  "app-remote-control",
  "user-modify-playback-state ",
  "user-read-playback-state",
];
const state = "some-state-of-my-choice";

// Spotify stuff below
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  redirectUri: redirectUri,
});

function getSpotifyPlaylist() {
  spotifyApi.getPlaylist(playlistId).then(
    function (data) {
      availableTracks = data.body.tracks.items;
      playRandomSong();
    },
    function (err) {
      console.log("Something went wrong!", err);
    }
  );
}

app.get("/login", (req, res) => {
  res.redirect(spotifyApi.createAuthorizeURL(scopes, state, true));
});

app.get("/callback", function (req, res) {
  res.sendFile(__dirname + "/loggedin.html");

  /* Read query parameters */
  var code = req.query.code; // Read the authorization code from the query parameters

  // Retrieve an access token and a refresh token
  spotifyApi.authorizationCodeGrant(code).then(
    function (data) {
      // Set the access token on the API object to use it in later calls
      spotifyApi.setAccessToken(data.body["access_token"]);
      spotifyApi.setRefreshToken(data.body["refresh_token"]);
    },
    function (err) {
      console.log("Something went wrong during login", err);
    }
  );
});

var firstPersonConnected = false;
// Websockets stuff below
io.on("connection", (socket) => {
  console.log(`User ${socket.id} connected`);

  socket.on("new-choice", (choice) => {
    console.log(choice, " form ", socket.id);

    socket.broadcast.emit("new-choice", choice);
  });

  socket.on("setup-vote", () => {
    setupPlaybackCheck();
  });

  socket.on("play", () => {
    spotifyApi.play().then(
      function () {
        console.log("Playback started");
      },
      function (err) {
        //if the user making the request is non-premium, a 403 FORBIDDEN response code will be returned
        console.log("Something went wrong!", err);
      }
    );
  });

  socket.on("pause", () => {
    spotifyApi.pause().then(
      function () {
        console.log("Playback paused");
      },
      function (err) {
        //if the user making the request is non-premium, a 403 FORBIDDEN response code will be returned
        console.log("Something went wrong!", err);
      }
    );
  });
});

var voteBusy = false;
var voteEnded = false;

function setupPlaybackCheck() {
  setInterval(() => {
    spotifyApi.getMyCurrentPlaybackState().then(
      function (data) {
        const voteStart = 40000;
        const voteEnd = 20000;
        const remainingDuration =
          data.body.item.duration_ms - data.body.progress_ms;

        if (
          !voteBusy &&
          remainingDuration <= voteStart &&
          remainingDuration > voteEnd
        ) {
          voteBusy = true;
          voteEnded = false;
          setupVote();
        }

        if (voteBusy && !voteEnded && remainingDuration <= voteEnd) {
          voteBusy = false;
          voteEnded = true;
          endVote();
        }
      },
      function (err) {
        console.log("Something went wrong fetching playback info ", err);
      }
    );
  }, 1000);
}

function setupVote() {
  console.log("SETUP VOTE");
}

function endVote() {
  console.log("END VOTE");
}

http.listen(3000, () => {});
