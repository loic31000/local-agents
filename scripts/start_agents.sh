#!/bin/bash

# Start all Python agents

# Start Discord bot
echo "Starting Discord agent..."
cd /app/agents/discord
python bot.py &

# Wait for all
wait