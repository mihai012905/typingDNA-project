const { createHash } = require('crypto');
// Setup basic express server
var express = require('express');
var app = express();
var path = require('path');
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var port = process.env.PORT || 3000;
var checks = require('./check_pattern.js');

String.prototype.hashCode = function() {
  var hash = 0;
  if (this.length == 0) {
      return hash;
  }
  for (var i = 0; i < this.length; i++) {
      var char = this.charCodeAt(i);
      hash = ((hash<<5)-hash)+char;
      hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
};


var users = {};
var numUsers = 0;

server.listen(port, () => {
  console.log('Server listening at port %d', port);
});

// Routing
app.use(express.static(path.join(__dirname, 'public')));

// battle ground

io.on('connection', (socket) => {
  var addedUser = false;

  // when the client emits 'new message', this listens and executes
  socket.on('new message', (data) => {
    // we tell the client to execute 'new message'

    socket.broadcast.emit('new message', {
      username: socket.username,
      message: data.message
    });

    checks.check_patterns(io, socket, data.pattern, users);

  });

  // when the client emits 'add user', this listens and executes
  socket.on('add user', (data) => {

    ++numUsers;
    // we store the username in the socket session for this client
    // in case it's new  
    if (data.pattern != undefined && data.username != ""){
      users[data.username] = data.username.hashCode();
      checks.save_pattern(users[data.username], data.pattern);
      addedUser = true;
      socket.username = data.username;
    }
    //else we go on as usually
    socket.emit('login', {
      numUsers: numUsers, 
      username:data.username
    });

    // echo globally (all clients) that a person has connected
    io.emit('user joined', {
      username: data.username,
      numUsers: numUsers
    });
  });

  // when the client emits 'typing', we broadcast it to others
  socket.on('typing', () => {
    socket.broadcast.emit('typing', {
      username: socket.username
    });
  });

  socket.on("delete pattern",(data)=>{
    checks.delete_pattern(users[data.user]);
    delete users[data.user];
    --numUsers;
    if(numUsers === 1){
      winner = Object.keys(users)[0];
      socket.broadcast.emit("winner",{
        winner:winner
      });
      // clean up the patterns from remaining users
      Object.keys(users).forEach(user=>{
        checks.delete_pattern(users[winner]);
      });
      numUsers=0;
      console.log("User " + winner + " won!");
      console.log("Cleaned Up!");
      users = {};
    }
  });

  // when the client emits 'stop typing', we broadcast it to others
  socket.on('stop typing', () => {
    socket.broadcast.emit('stop typing', {
      username: socket.username
    });
  });

  // when the user disconnects.. perform this
  socket.on('disconnect', () => {
    if (addedUser) {
      --numUsers;
      
      // echo globally that this client has left
      io.emit('user left', {
        username: socket.username,
        numUsers: numUsers,
      });
    }
  });
});

