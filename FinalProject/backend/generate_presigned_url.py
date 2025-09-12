#!/usr/bin/env python3
"""
generate_presigned_url.py
Command-line wrapper for presigned.py to be called from Node.js main process
"""

import sys
import json
import os
from pathlib import Path

# Add backend directory to Python path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

try:
    from presigned import get_upload_url
    
    if len(sys.argv) < 2:
        print(json.dumps({"error": "filename argument required"}), file=sys.stderr)
        sys.exit(1)
    
    filename = sys.argv[1]
    
    # Generate presigned URL
    result = get_upload_url(filename)
    
    # Output JSON result to stdout
    print(json.dumps(result))
    sys.exit(0)
    
except Exception as e:
    print(json.dumps({"error": str(e)}), file=sys.stderr)
    sys.exit(1)