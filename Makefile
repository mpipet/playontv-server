install_deps:
	npm install

config:
	cp config_default.js config.js

build:
	$(MAKE) config
	$(MAKE) install_deps

start:
	node server.js