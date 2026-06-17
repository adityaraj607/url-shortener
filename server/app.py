# flask app - routes and rate limiting

import random
import string
import os

from flask import Flask, request, jsonify, redirect, send_from_directory, abort
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from server.db import init_db, create_short_url, get_url, record_click, get_analytics, list_all_urls, code_exists
from server.qr_gen import generate_qr

app = Flask(__name__, static_folder="../public", static_url_path="")

limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=[],
    storage_uri="memory://"
)

init_db()

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080")


def random_code(length=6):
    chars = string.ascii_letters + string.digits
    return "".join(random.choices(chars, k=length))


def make_unique_code():
    for _ in range(10):
        code = random_code()
        if not code_exists(code):
            return code
    return None


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/app.js")
def app_js():
    return send_from_directory(app.static_folder, "app.js")


@app.route("/api/shorten", methods=["POST"])
@limiter.limit("10 per minute")
def shorten():
    data = request.get_json(silent=True) or {}
    original_url = (data.get("url") or "").strip()
    custom_alias = (data.get("alias") or "").strip()

    if not original_url:
        return jsonify({"error": "url is required"}), 400

    if not original_url.startswith(("http://", "https://")):
        original_url = "https://" + original_url

    if custom_alias:
        if not all(c.isalnum() or c == "-" for c in custom_alias):
            return jsonify({"error": "alias can only contain letters numbers and hyphens"}), 400
        if code_exists(custom_alias):
            return jsonify({"error": "alias already taken"}), 409
        short_code = custom_alias
    else:
        short_code = make_unique_code()
        if not short_code:
            return jsonify({"error": "could not generate a unique code try again"}), 500

    if not create_short_url(short_code, original_url):
        return jsonify({"error": "failed to save url"}), 500

    short_url = f"{BASE_URL}/{short_code}"

    return jsonify({
        "short_code": short_code,
        "short_url": short_url,
        "original_url": original_url,
        "qr": generate_qr(short_url)
    }), 201


@app.route("/<short_code>")
def redirect_url(short_code):
    row = get_url(short_code)
    if not row:
        abort(404)
    ip = request.headers.get("X-Forwarded-For", request.remote_addr)
    ua = request.headers.get("User-Agent", "")
    record_click(short_code, ip, ua)
    return redirect(row["original_url"], code=302)


@app.route("/api/analytics/<short_code>")
def analytics(short_code):
    data = get_analytics(short_code)
    if not data:
        return jsonify({"error": "not found"}), 404
    return jsonify(data)


@app.route("/api/qr/<short_code>")
def qr(short_code):
    row = get_url(short_code)
    if not row:
        return jsonify({"error": "not found"}), 404
    return jsonify({"qr": generate_qr(f"{BASE_URL}/{short_code}")})


@app.route("/api/urls")
def all_urls():
    return jsonify(list_all_urls())


@app.errorhandler(429)
def rate_limit_exceeded(e):
    return jsonify({"error": "too many requests - max 10 per minute"}), 429


if __name__ == "__main__":
    app.run(debug=True, port=8080)
