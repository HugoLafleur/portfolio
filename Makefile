# Hugo Lafleur — personal site. Static files in ./mock, no build dependencies.

PORT ?= 4173
SRC  := mock
DIST := dist

.PHONY: build run test clean help

help:
	@echo "make run    Serve $(SRC)/ on http://localhost:$(PORT) and open the browser"
	@echo "make test   Syntax-check scripts and run the test suite"
	@echo "make build  Test, then copy the site into $(DIST)/ for deployment"
	@echo "make clean  Remove $(DIST)/"

build: test clean
	@mkdir -p $(DIST)
	@cp $(SRC)/*.html $(SRC)/*.css $(SRC)/*.js $(DIST)/
	@if [ -d functions ]; then cp -r functions $(DIST)/; fi
	@echo "Built $(DIST)/:" && ls $(DIST)

run:
	@if lsof -nP -iTCP:$(PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "Already serving on http://localhost:$(PORT)"; open http://localhost:$(PORT); \
	else \
		(sleep 1 && open http://localhost:$(PORT)) & \
		python3 -m http.server $(PORT) --directory $(SRC); \
	fi

test:
	@for f in $(SRC)/*.js; do node --check $$f || exit 1; done
	@node --test test/

clean:
	@rm -rf $(DIST)
