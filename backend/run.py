import eventlet
eventlet.monkey_patch()

import os
from dotenv import load_dotenv
from app import create_app
from app.extensions import socketio

load_dotenv()

app = create_app(os.getenv("FLASK_ENV", "development"))

def main():
    # En prod sur Railway, on utilisera PORT, sinon 3001 en local
    port = int(os.getenv("PORT", 3001))
    socketio.run(
        app,
        host="0.0.0.0",
        port=port,
        debug=False,
        use_reloader=False,
    )

if __name__ == "__main__":
    main()
