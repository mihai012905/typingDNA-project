// Setup basic express server
var express = require('express');
var app = express();
var path = require('path');
var server = require('http').createServer(app);
var io = require('socket.io')(server);
const dotenv = require('dotenv');
dotenv.config();
var port = process.env.PORT || 3000;
var checks = require('./check_pattern.js');


async function asyncCall(argument, callback){

  await callback(argument);

}

// hash function for storing pattern 
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
}

// encoding function but it can be any encode function, as long it is supported on CSS
String.prototype.encode = function() {
  //eliminate spaces and numbers
  str = this.replace(/^[\s\d]+/, '');
  str = str.replace(/\s/g, '');

  return str;
};



var users = {};
var numUsers = 0;

server.listen(port, () => {
  console.log('Server listening at port %d', port);
  console.log(`This process is pid ${process.pid}`);
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

    if (!(data.username in users)){
      ++numUsers;
    }

    // we store the username in the socket session for this client
    // in case it's new , together with the other data
    if (data.pattern != undefined && data.username != ""){
      users[data.username] = {"encoded":data.username.encode(), "hash":data.username.hashCode()};
      checks.save_pattern(users[data.username]["hash"], data.pattern);
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
    checks.delete_pattern(users[data.user]["hash"]);
    delete users[data.user];
    --numUsers;
    console.log(`${numUsers} users`);

    if(numUsers === 1){
      winner = Object.keys(users)[0];
      socket.broadcast.emit("winner",{
        winner:winner
      });
      // clean up the patterns from last user
      checks.delete_pattern(users[winner]["hash"]);

      numUsers=0;
      users = {};
      console.log("User " + winner + " won!");
      console.log("Cleaned Up!");
      
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
      
      if (numUsers > 1){
        --numUsers;
        checks.delete_pattern(users[socket.username]["hash"]);
        delete users[socket.username];
      }
      if(numUsers === 1){
        winner = Object.keys(users)[0];
        socket.broadcast.emit("winner",{
          winner:winner
        });
        // clean up the patterns from the last user
        checks.delete_pattern(users[winner]["hash"]);
        numUsers=0;
        console.log("User " + winner + " won!");
        console.log("Cleaned Up!");
        users = {};
      }
      
      // echo globally that this client has left
      io.emit('user left', {
        username: socket.username,
        numUsers: numUsers,
      });
    }
  });
});

process.on('SIGTERM', () => {
  console.info('SIGTERM signal received.');
  console.log('Closing http server.');
  console.log('Deleting users.');

  (async function() {
    for (var user in users)
    {
      if (users.hasOwnProperty(user)) {    
        //asyncCall(users[user]["hash"] ,checks.delete_pattern);     
        await checks.delete_pattern(users[user]["hash"]); 
        console.log(user);
      } 
    }
    
  })()
  
  setTimeout(()=>{
    server.close();
    console.log("HTTP server closed");
    console.log("Process killed.");
    process.exit(0)},5000);
});