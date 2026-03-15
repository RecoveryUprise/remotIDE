// Start the remotIDE server on a specific port (default 5000)
const PORT = process.env.PORT || 5000;
const server = require('http').createServer();
let io = require('socket.io')(server);

// Initialize local variables and functions

function startServer(port) {
    server.listen(port, '0.0.0.0', () => {
        console.log(`remotIDE server listening on http://0.0.0.0:${port}`);
    });

    server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`Port ${port} is in use, trying port ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error(err);
        }
    });
}

startServer(PORT);