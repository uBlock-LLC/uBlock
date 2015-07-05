BIN := ./node_modules/.bin

install link:
	@npm $@

lint:
	@$(BIN)/jshint index.js

test::
	@$(BIN)/mocha -b -R spec ./test/*.js

release-patch: test
	@$(call release,patch)

release-minor: test
	@$(call release,minor)

release-major: test
	@$(call release,major)

publish:
	git push --tags origin HEAD:master
	npm publish

define release
	npm version $(1)
endef
