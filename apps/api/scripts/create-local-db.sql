-- One-time setup of a native (non-Docker) local PostgreSQL for development.
-- Run as a PostgreSQL superuser, see README.md. The password matches .env.example.
CREATE ROLE inventra WITH LOGIN PASSWORD 'inventra_dev';
CREATE DATABASE inventra OWNER inventra;
CREATE DATABASE inventra_test OWNER inventra;
