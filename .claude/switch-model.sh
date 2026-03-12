#!/bin/bash

# Model switching script for Claude Code settings
# Usage: ./switch-model.sh [glm|minimax]

SETTINGS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETTINGS_FILE="$SETTINGS_DIR/settings.json"

case "$1" in
    glm)
        echo "Switching to GLM models..."
        cp "$SETTINGS_DIR/settings-glm.json" "$SETTINGS_FILE"
        echo "✓ Now using GLM models (glm-4.7, glm-4.5-ai)"
        ;;
    minimax)
        echo "Switching to MiniMax models..."
        cp "$SETTINGS_DIR/settings-minimax.json" "$SETTINGS_FILE"
        echo "✓ Now using MiniMax models (MiniMax-M2.5)"
        ;;
    *)
        echo "Usage: $0 [glm|minimax]"
        echo ""
        echo "  glm     - Switch to GLM models (智谱AI)"
        echo "  minimax - Switch to MiniMax models"
        exit 1
        ;;
esac
