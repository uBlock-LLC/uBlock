#!/bin/bash
./tools/make-chromium.sh;
python -m unittest discover tests/selenium -p '*.py';
