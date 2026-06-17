# db layer - mysql queries

import os
import pymysql
import pymysql.cursors

DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = int(os.environ.get("DB_PORT", "3306"))
DB_USER = os.environ.get("DB_USER", "root")
DB_PASS = os.environ.get("DB_PASS", "")
DB_NAME = os.environ.get("DB_NAME", "urlshort")


def get_conn():
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASS,
        database=DB_NAME,
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
        charset="utf8mb4"
    )


def init_db():
    # create db if missing then create tables
    conn = pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASS,
        charset="utf8mb4"
    )
    with conn.cursor() as c:
        c.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
    conn.commit()
    conn.close()

    conn = get_conn()
    with conn.cursor() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS urls (
                id INT AUTO_INCREMENT PRIMARY KEY,
                short_code VARCHAR(64) UNIQUE NOT NULL,
                original_url TEXT NOT NULL,
                created_at DATETIME DEFAULT NOW(),
                total_clicks INT DEFAULT 0
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS clicks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                short_code VARCHAR(64) NOT NULL,
                clicked_at DATETIME DEFAULT NOW(),
                ip VARCHAR(64),
                user_agent TEXT,
                FOREIGN KEY (short_code) REFERENCES urls(short_code) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
    conn.commit()
    conn.close()


def create_short_url(short_code, original_url):
    conn = get_conn()
    try:
        with conn.cursor() as c:
            c.execute(
                "INSERT INTO urls (short_code, original_url) VALUES (%s, %s)",
                (short_code, original_url)
            )
        conn.commit()
        return True
    except pymysql.err.IntegrityError:
        return False
    finally:
        conn.close()


def get_url(short_code):
    conn = get_conn()
    try:
        with conn.cursor() as c:
            c.execute("SELECT * FROM urls WHERE short_code = %s", (short_code,))
            return c.fetchone()
    finally:
        conn.close()


def record_click(short_code, ip, user_agent):
    conn = get_conn()
    try:
        with conn.cursor() as c:
            c.execute(
                "INSERT INTO clicks (short_code, ip, user_agent) VALUES (%s, %s, %s)",
                (short_code, ip, user_agent)
            )
            c.execute(
                "UPDATE urls SET total_clicks = total_clicks + 1 WHERE short_code = %s",
                (short_code,)
            )
        conn.commit()
    finally:
        conn.close()


def get_analytics(short_code):
    conn = get_conn()
    try:
        with conn.cursor() as c:
            c.execute("SELECT * FROM urls WHERE short_code = %s", (short_code,))
            url_row = c.fetchone()
            if not url_row:
                return None

            c.execute("""
                SELECT DATE(clicked_at) AS day, COUNT(*) AS count
                FROM clicks
                WHERE short_code = %s
                GROUP BY day
                ORDER BY day ASC
                LIMIT 30
            """, (short_code,))
            daily = c.fetchall()

            c.execute("""
                SELECT clicked_at, ip, user_agent
                FROM clicks
                WHERE short_code = %s
                ORDER BY clicked_at DESC
                LIMIT 10
            """, (short_code,))
            recent = c.fetchall()

        return {
            "url": _stringify_dates(url_row),
            "daily": [_stringify_dates(r) for r in daily],
            "recent": [_stringify_dates(r) for r in recent]
        }
    finally:
        conn.close()


def list_all_urls():
    conn = get_conn()
    try:
        with conn.cursor() as c:
            c.execute("SELECT * FROM urls ORDER BY created_at DESC LIMIT 50")
            rows = c.fetchall()
        return [_stringify_dates(r) for r in rows]
    finally:
        conn.close()


def code_exists(short_code):
    conn = get_conn()
    try:
        with conn.cursor() as c:
            c.execute("SELECT 1 FROM urls WHERE short_code = %s", (short_code,))
            return c.fetchone() is not None
    finally:
        conn.close()


def _stringify_dates(row):
    if not row:
        return row
    return {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in row.items()}
