# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Whisper model selection: small (default) or medium, used only when platform captions are unavailable.

### Changed

- Improved audio preparation for Whisper: WAV mono 16 kHz conversion with FFmpeg loudness normalization.

- TikTok short links work in the dashboard. Paste vm.tiktok.com, vt.tiktok.com or tiktok.com/t/... links and they resolve to canonical video addresses.
- Transcribe video and audio files locally with the CLI, plus bulk processing and formats.

## [1.2.0] - 2026-11-19

Transcripts arrive as Markdown documents and links are forgiving about quotes.

### Changed

- CLI and MCP tools save Markdown transcripts by default, with exact package versioning and full paths.

### Fixed

- Link cleanup and output-folder creation fixes.

## [1.1.0] - 2026-11-17

### Added

- CLI shorthand, multiple output formats, timestamping, batch transcription and MCP server.

## [1.0.0] - 2026-09-22

### Added

- Extract transcripts from TikTok, Instagram, YouTube and local media.
- Prefer platform captions, with Whisper fallback.
