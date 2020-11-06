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
  console.log(`Socket ${socket.id} connected`);

  if (voteBusy) {
    io.emit("new-vote", options);
    io.emit("votes-updated", votes);
  } else {
    if (winningTrackId) {
      io.emit("end-vote", winningTrackId);
    }
  }

  socket.on("send-vote", (trackId) => {
    console.log("New vote ", trackId, " form ", socket.id);
    const foundIndex = votes.findIndex((vote) => vote.socketId === socket.id);
    const newVote = { socketId: socket.id, trackId: trackId };

    if (foundIndex >= 0) {
      votes[foundIndex] = newVote;
    } else {
      votes.push(newVote);
    }

    io.emit("votes-updated", votes);
  });

  socket.on("disconnect", () => {
    console.log(`Socket ${socket.id} disconnected`);
    removeDisconnectedVote(socket.id);
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

const voteStart = 50000;
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
        if (
          data.body == null ||
          data.body.item == null ||
          data.body.progress_ms == null
        ) {
          console.log(
            "No playback data unavailable cannot start playback check"
          );
          return;
        }
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
          console.log("Start vote");
        }

        if (voteBusy && !voteEnded && remainingDuration <= voteEnd) {
          voteBusy = false;
          voteEnded = true;
          endVote();
          console.log("End vote");
        }
      },
      function (err) {
        spotifyApi.refreshAccessToken();
      }
    );
  }, 1000);
}

/**
 * Method to get a certain amount of random items from an array
 */
function getRandomElementsFromArray(array, amount) {
  // Shuffle array
  const shuffledArray = array.sort(() => 0.5 - Math.random());
  // Get sub-array of first n elements after shuffled
  return shuffledArray.slice(0, amount);
}

/**
 * Method to setup the vote and emit to all connected sockets.
 */
var options;
function setupVote() {
  options = getRandomElementsFromArray(availableTracks, 2);
  io.emit("new-vote", options);
}

/**
 * Method to end a vote.
 */
var winningTrackId;
function endVote() {
  // Determine winner
  winningTrackId = determineWinningTrack();
  console.log(`Winning track: ${winningTrackId}`);
  // Add winner to queue
  addTrackToQueue(winningTrackId);
  // Emit end event
  io.emit("end-vote", winningTrackId);
  // Clean up
  options = [];
  votes = [];
  // Remove track from available options
  removeTrackFromAvailableOptions(winningTrackId);
  console.log("Available tracks length ", availableTracks.length);
}

/**
 * Method to remove votes when a socket disconnects
 */
function removeDisconnectedVote(socketId) {
  const voteIndex = votes.findIndex((vote) => vote.socketId == socketId);
  if (voteIndex >= 0) {
    votes.splice(voteIndex, 1);
  }
}

/**
 * Method to remove track from available options.
 */
function removeTrackFromAvailableOptions(trackId) {
  const trackIndex = availableTracks.findIndex(
    (track) => track.track.id == trackId
  );
  if (trackIndex >= 0) {
    availableTracks.splice(trackIndex, 1);
  }
}

/**
 * Method to determine the winning track.
 */
function determineWinningTrack() {
  const option0VoteCount = votes.filter(
    (vote) => vote.trackId === options[0].track.id
  ).length;
  const option1VoteCount = votes.filter(
    (vote) => vote.trackId === options[1].track.id
  ).length;

  if (option0VoteCount > option1VoteCount) {
    console.log(
      `Track  ${options[0].track.id} won with ${option0VoteCount} votes`
    );
    return options[0].track.id;
  }

  if (option0VoteCount < option1VoteCount) {
    console.log(
      `Track  ${options[1].track.id} won with ${option1VoteCount} votes`
    );
    return options[1].track.id;
  }
  console.log(`Tracks tied with ${option0VoteCount} votes`);
  // Always use the first item since the method returns an array.
  return getRandomElementsFromArray(options, 1)[0].track.id;
}

function addTrackToQueue(trackId) {
  const config = {
    headers: {
      // eslint-disable-next-line
      // prettier-ignore
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
      // console.log("Successful added to queue");
    })
    .catch(function () {
      console.log("Failed to add to queue");
    });
}

http.listen(3000, () => {});
