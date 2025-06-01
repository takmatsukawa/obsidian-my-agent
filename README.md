# Obsidian My Agent

This is an Obsidian plugin that is designed to support my own Obsidian life with the power of AI.

## Features

### Command: "Generate a weekly note"

This command executes the following steps:

1. Read 1 week of daily notes, send them to OpenAI's ChatGPT, and summarize them.
2. List all updated notes in the week.
2. Generate a new weekly note with the summary and the list, and save it to the specified folder.

#### Requirements

- Daily Notes plugin should be enabled and configured
- Periodic Notes plugin (optional, for folder configuration)

### Settings

- OpenAI API Key: API key for ChatGPT integration
