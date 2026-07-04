CMD = npm run
DEST = dest
DECL = types

r: run
run:
	$(CMD) main

cleandest:
	rmdir /s /q $(DEST)

cleandecl:
	rmdir /s /q $(DECL)

.PHONY: all run
