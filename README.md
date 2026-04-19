# Tick Game WebSocket

A real-time multiplayer interactive grid game powered by WebSockets. Click, tick, and untick a million cells in sync with everyone connected. Built with Node.js, Express, and Socket.io.

## Features

- **Million Cells Grid**: 1000×1000 interactive grid (1M cells)
- **Canvas Viewport**: Smooth rendering using canvas viewport technique—only visible cells are rendered
- **Real-Time Sync**: Live WebSocket synchronization across all connected users
- **Live Stats**: See checked count and percentage updated in real-time
- **Multi-User Support**: Watch other users' clicks happen instantly

## Tech Stack

- **Backend**: Node.js + Express + Socket.io
- **Frontend**: Vanilla JavaScript + Canvas API
- **Deployment**: Vercel (serverless with WebSocket support)

## Getting Started

### Prerequisites
- Node.js 16+ installed

### Installation

```bash
git clone https://github.com/prasadbhalerao1/tickgame-websocket.git
cd tickgame-websocket
npm install
```

### Development

```bash
npm start
```

Open `http://localhost:3000` in your browser. Open multiple tabs to see real-time sync!

## How It Works

- **Frontend**: Uses canvas to render only visible cells in the viewport
- **Sparse State**: Server only stores checked cells (not all 1M)
- **WebSocket Events**:
  - `cell:toggle` - User clicks a cell
  - `cell:update` - Broadcast cell state change
  - `grid:reset` - Reset all cells (unused)
  - `stats:update` - Live stats broadcast

## Deployment to Vercel

```bash
vercel
```

The project is configured with `vercel.json` for automatic deployment. Just connect your GitHub repo and deploy!

## File Structure

```
tickgame-websocket/
├─ server.js          # Express + Socket.io server
├─ package.json       # Dependencies
├─ vercel.json        # Vercel deployment config
├─ .gitignore         # Git ignore rules
├─ README.md          # This file
└─ public/
   ├─ index.html      # UI
   ├─ style.css       # Styling
   └─ script.js       # Client logic
```

## Performance

- **Rendering**: Only visible cells in viewport are drawn
- **State**: Sparse Set data structure (only checked cells stored)
- **Memory**: Efficient even at 1M cells
- **Real-time**: Socket.io handles thousands of concurrent connections

## License

MIT
