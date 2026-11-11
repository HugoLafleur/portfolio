# Hugo Lafleur — personal site. Static files in ./mock, no build dependencies.

PORT ?= 4173
SRC  := mock
DIST := dist

.PHONY: build data run test probe pdf clean help

help:
	@echo "make data   Regenerate $(SRC)/data.js from content/*.md"
	@echo "make run    Serve $(SRC)/ on http://localhost:$(PORT) and open the browser"
	@echo "make test   Syntax-check scripts and run the test suite"
	@echo "make probe  Run live injection and language checks against Cohere (needs COHERE_API_KEY, costs API calls)"
	@echo "make pdf    Regenerate $(SRC)/resume.pdf and resume-fr_ca.pdf from the print stylesheet (needs Google Chrome)"
	@echo "make build  Test, then copy the site into $(DIST)/ for deployment"
	@echo "make clean  Remove $(DIST)/"

data:
	@node scripts/build-data.js

build: test clean
	@mkdir -p $(DIST)
	@cp $(SRC)/*.html $(SRC)/*.css $(SRC)/*.js $(SRC)/*.pdf $(DIST)/
	@echo "Built $(DIST)/:" && ls $(DIST)

run: data
	@if lsof -nP -iTCP:$(PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "Already serving on http://localhost:$(PORT)"; open http://localhost:$(PORT); \
	else \
		(sleep 1 && open http://localhost:$(PORT)) & \
		node scripts/dev.js; \
	fi

test: data
	@for f in $(SRC)/*.js functions/api/*.js scripts/*.js; do node --check $$f || exit 1; done
	@node --test test/

probe:
	@node scripts/probe.js

CHROME ?= /Applications/Google Chrome.app/Contents/MacOS/Google Chrome

pdf:
	@"$(CHROME)" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=5000 --print-to-pdf="$(CURDIR)/$(SRC)/resume.pdf" "file://$(CURDIR)/$(SRC)/index.html?lang=en" >/dev/null 2>&1
	@"$(CHROME)" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=5000 --print-to-pdf="$(CURDIR)/$(SRC)/resume-fr_ca.pdf" "file://$(CURDIR)/$(SRC)/index.html?lang=fr_ca" >/dev/null 2>&1
	@echo "Wrote $(SRC)/resume.pdf and $(SRC)/resume-fr_ca.pdf"

clean:
	@rm -rf $(DIST)
