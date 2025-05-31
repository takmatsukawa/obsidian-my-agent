# Obsidian My Agent

This is a Obsidian plugin that is designed to support my own Obsidian life with the power of AI.

## Features

### Command: "Generate a weekly note"

This command executes the following steps:

1. Read 1 week of daily notes, send them to OpenAI's ChatGPT, and summarize them.
2. Generate a new weekly note with the summary and save it to the specified folder.

#### Weekly Note Specifications

- **File Location**: Weekly notes are saved to the folder specified in the Periodic Notes plugin's "Weekly Note Folder" setting. If Periodic Notes plugin is not installed or configured, the default folder "Weekly" will be used.
- **File Name Format**: Weekly notes are named using the format `YYYY-WXX` (e.g., `2025-W23` for the 23rd week of 2025).
- **Week Number Calculation**: Uses ISO 8601 week numbering standard.
- **Content Structure**: Each weekly note includes:
  - Major events during the week
  - Achievements during the week
  - Lessons learned during the week
  - Identified challenges
  - Next actions

#### Requirements

- Daily Notes plugin should be enabled and configured
- At least one daily note should exist in the past week
- Periodic Notes plugin (optional, for folder configuration)

### Settings

- OpenAI API Key: API key for ChatGPT integration

## Usage

1. Configure your OpenAI API key in the plugin settings
2. Ensure Daily Notes plugin is enabled and you have daily notes created
3. Run the command "Generate a weekly note" from the command palette
4. The weekly note will be automatically created and opened
