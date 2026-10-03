-- NEXARY core schema (PostgreSQL 14+ / Supabase). NOT yet executed against a live Postgres.
-- Auth.js (if used) brings its own accounts/sessions/verification_tokens tables via its adapter; not duplicated here.
-- Intentionally NOT created yet (add when the feature ships): tournaments, clubs, messages, notifications, achievements, settings.
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE time_class  AS ENUM ('bullet', 'blitz', 'rapid');
CREATE TYPE game_status AS ENUM ('WAITING', 'PLAYING', 'PAUSED', 'FINISHED');
CREATE TYPE game_result AS ENUM ('1-0', '0-1', '1/2-1/2', '*');
CREATE TYPE termination AS ENUM ('CHECKMATE','RESIGNATION','TIMEOUT','STALEMATE','REPETITION','FIFTY_MOVE','INSUFFICIENT','AGREEMENT','ABORTED','ABANDONED');

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          citext NOT NULL UNIQUE,
  email_verified timestamptz,
  password_hash  text,                       -- NULL for OAuth-only accounts (argon2id/bcrypt hash, never plaintext)
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username   citext NOT NULL UNIQUE CHECK (username ~ '^[A-Za-z0-9_]{3,20}$'),
  avatar_url text,
  country    char(2),
  bio        text CHECK (char_length(bio) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE games (
  id           char(26) PRIMARY KEY,         -- ULID
  white_id     uuid NOT NULL REFERENCES users(id),
  black_id     uuid NOT NULL REFERENCES users(id),
  status       game_status NOT NULL DEFAULT 'WAITING',
  result       game_result NOT NULL DEFAULT '*',
  termination  termination,
  time_class   time_class NOT NULL,
  base_ms      integer NOT NULL CHECK (base_ms > 0),
  increment_ms integer NOT NULL DEFAULT 0 CHECK (increment_ms >= 0),
  rated        boolean NOT NULL DEFAULT true,
  initial_fen  text NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  final_fen    text,
  pgn          text,
  started_at   timestamptz,
  ended_at     timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  version      integer NOT NULL DEFAULT 0,   -- optimistic concurrency
  CHECK (white_id <> black_id),
  CHECK (status <> 'FINISHED' OR termination IS NOT NULL)
);
CREATE INDEX games_white_id_idx ON games (white_id);
CREATE INDEX games_black_id_idx ON games (black_id);
CREATE INDEX games_status_idx   ON games (status);

CREATE TABLE moves (
  id            bigserial PRIMARY KEY,
  game_id       char(26) NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  ply           integer NOT NULL CHECK (ply > 0),
  san           text NOT NULL,
  from_sq       char(2) NOT NULL,
  to_sq         char(2) NOT NULL,
  promotion     char(1) CHECK (promotion IN ('q','r','b','n')),
  fen_before    text NOT NULL,
  fen_after     text NOT NULL,
  clock_left_ms integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, ply)                      -- also serves as the moves(game_id) index
);

CREATE TABLE ratings (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  time_class   time_class NOT NULL,
  rating       double precision NOT NULL DEFAULT 1500,
  rd           double precision NOT NULL DEFAULT 350,
  vol          double precision NOT NULL DEFAULT 0.06,
  games_played integer NOT NULL DEFAULT 0,
  provisional  boolean GENERATED ALWAYS AS (games_played < 10) STORED,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, time_class)
);
CREATE INDEX ratings_leaderboard_idx ON ratings (time_class, rating DESC) WHERE games_played >= 10;

-- Written ONLY by the server, in the same transaction that marks the game FINISHED.
-- UNIQUE (user_id, game_id) makes the rating update exactly-once per game per player.
CREATE TABLE rating_history (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  time_class    time_class NOT NULL,
  game_id       char(26) NOT NULL REFERENCES games(id),
  rating_before double precision NOT NULL,
  rating_after  double precision NOT NULL,
  rd_after      double precision NOT NULL,
  vol_after     double precision NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, game_id)
);
CREATE INDEX rating_history_user_idx ON rating_history (user_id, time_class, created_at DESC);

CREATE TABLE friendships (
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','blocked')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX friendships_pair_idx ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX friendships_addressee_idx ON friendships (addressee_id, status);

CREATE TABLE challenges (
  id            char(26) PRIMARY KEY,        -- ULID
  challenger_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenged_id uuid REFERENCES users(id) ON DELETE CASCADE,  -- NULL = open challenge / shareable link
  base_ms       integer NOT NULL CHECK (base_ms > 0),
  increment_ms  integer NOT NULL DEFAULT 0 CHECK (increment_ms >= 0),
  rated         boolean NOT NULL DEFAULT true,
  color_pref    text NOT NULL DEFAULT 'random' CHECK (color_pref IN ('white','black','random')),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','declined','cancelled','expired')),
  game_id       char(26) REFERENCES games(id),
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX challenges_challenged_idx ON challenges (challenged_id, status);
CREATE INDEX challenges_open_idx ON challenges (status, expires_at) WHERE status = 'open';
