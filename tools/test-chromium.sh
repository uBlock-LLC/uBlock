#!/bin/bash
./tools/make-chromium.sh testing;
python -m unittest discover tests/selenium -p 'test_*.py';
