# Chat App Server

A real-time chat application server built with Node.js, Express, MongoDB, and Socket.IO.

## Features

- Real-time messaging using Socket.IO
- User authentication with JWT
- File uploads with Cloudinary integration
- MongoDB database integration
- RESTful API endpoints
- Secure password hashing with bcrypt

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Moazam05/react-native-chat-app-server.git
cd react-native-chat-app-server
```

2. Install dependencies:
```bash
npm install --legacy-peer-deps
```

3. Create a `.env` file in the root directory and add your environment variables:
```env
NODE_ENV=development
PORT=5000
DATABASE=[your-mongodb-connection-string]
JWT_SECRET=[your-jwt-secret]
JWT_EXPIRES_IN=10d
CLOUDINARY_CLOUD_NAME=[your-cloudinary-name]
CLOUDINARY_API_KEY=[your-cloudinary-key]
CLOUDINARY_API_SECRET=[your-cloudinary-secret]
```

## Running the Server

Development mode with nodemon:
```bash
npm run server
```

Production mode:
```bash
npm start
```

## Project Structure

```
chatappserver/
├── server.js          # Entry point
├── package.json       # Project dependencies
├── .env              # Environment variables
└── [other project files]
```

## Dependencies

- `express`: Web framework
- `socket.io`: Real-time communication
- `mongoose`: MongoDB ODM
- `jsonwebtoken`: JWT authentication
- `bcryptjs`: Password hashing
- `cloudinary`: Cloud storage for files
- `multer`: File upload handling
- `cors`: Cross-origin resource sharing
- `dotenv`: Environment variables
- `morgan`: HTTP request logger
- `validator`: Input validation
- `colors`: Terminal styling

## Environment Variables

| Variable | Description |
|----------|-------------|
| NODE_ENV | Development/production environment |
| PORT | Server port number |
| DATABASE | MongoDB connection string |
| JWT_SECRET | Secret key for JWT |
| JWT_EXPIRES_IN | JWT expiration time |
| CLOUDINARY_CLOUD_NAME | Cloudinary cloud name |
| CLOUDINARY_API_KEY | Cloudinary API key |
| CLOUDINARY_API_SECRET | Cloudinary API secret |


## Author

Salman Muazam
