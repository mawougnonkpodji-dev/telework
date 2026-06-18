import eventlet
eventlet.monkey_patch()

import os
from dotenv import load_dotenv
from app import create_app
from app.extensions import socketio

load_dotenv()

app = create_app(os.getenv("FLASK_ENV", "development"))

if __name__ == "__main__":
    socketio.run(
        app,
        debug=True,
        port=3001,
        use_reloader=True,
    )
