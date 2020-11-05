var app = require("express")();
var http = require("http").createServer(app);
var io = require("socket.io")(http);
const axios = require("axios").default;
const dotenv = require("dotenv");
dotenv.config();
var SpotifyWebApi = require("spotify-web-api-node");
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
      getSpotifyPlaylist();
    },
    function (err) {
      console.log("Something went wrong during login", err);
    }
  );
});

var votes = [];
var options = [];
io.on("connection", (socket) => {
  console.log(`User ${socket.id} connected`);

  socket.on("send-vote", (trackId) => {
    console.log("New vote ", trackId, " form ", socket.id);
    const foundIndex = votes.findIndex((vote) => vote.socketId === socket.id);
    const newVote = { socketId: socket.id, trackId: trackId };

    if (foundIndex >= 0) {
      votes[foundIndex] = newVote;
    } else {
      votes.push(newVote);
    }
    console.log(votes);
  });
});

const playlistId = "7K856YlxjAzxUIFuzRBsGa";
function getSpotifyPlaylist() {
  spotifyApi.getPlaylist(playlistId).then(
    function (data) {
      availableTracks = data.body.tracks.items;
      setupPlaybackCheck();
    },
    function (err) {
      console.log("Something went wrong!", err);
    }
  );
}

const voteStart = 80000;
const voteEnd = 20000;
var voteBusy = false;
var voteEnded = false;
/**
 * Setup playback check to trigger vote start and end
 */
function setupPlaybackCheck() {
  console.log("SETUP PLAYBACK CHECK");
  setInterval(() => {
    spotifyApi.getMyCurrentPlaybackState().then(
      function (data) {
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

/**
 * Method to get two random items from the available tracks.
 */
function getRandomElementsFromArray(array, amount) {
  // Shuffle array
  const shuffledTracks = array.sort(() => 0.5 - Math.random());
  // Get sub-array of first n elements after shuffled
  return shuffledTracks.slice(0, amount);
}

/**
 * Method to setup the vote and emit to all connected sockets.
 */
function setupVote() {
  options = getRandomElementsFromArray(availableTracks, 2);
  io.emit("new-vote", options);
}

function endVote() {
  // Emit end event
  io.emit("end-vote");
  // Determine winner
  const winningTrack = determineWinningTrack();
  // Add winner to queue
  addTrackToQueue(winningTrack);
  // Clean up
  options = null;
  votes = [];
  // TODO Remove track from available options

}

function determineWinningTrack() {
  const option0VoteCount = votes.filter(
    (vote) => vote.trackId === options[0].track.id
  ).length;
  const option1VoteCount = votes.filter(
    (vote) => vote.trackId === options[1].track.id
  ).length;

  if (option0VoteCount > option1VoteCount) {
    console.log("Track", options[0].track.id, "won");
    return options[0].track.id;
  }

  if (option0VoteCount > option1VoteCount) {
    console.log("Track", options[1].track.id, "won");
    return options[0].track.id;
  }
  console.log("Tracks tied with ", option0VoteCount, " votes");

  return getRandomElementsFromArray(options, 1);
}

function addTrackToQueue(trackId) {
  const config = {
    headers: {
      "Authorization": `Bearer ${spotifyApi.getAccessToken()}`,
    },
  };
  axios
    .post(
      `https://api.spotify.com/v1/me/player/queue?uri=spotify:track:${trackId}`,
      null,
      config
    )
    .then(function () {
      console.log("Successful added to queue");
    })
    .catch(function () {
      console.log("Failed to add to queue");
    });
}

http.listen(3000, () => {});
