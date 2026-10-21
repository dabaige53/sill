// xctrace emits a Darwin notification. Relay it outside the sandboxed XCTest runner.
#include <dispatch/dispatch.h>
#include <notify.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

int main(int argc, char **argv) {
  if (argc != 3) return 2;
  int token;
  const char *path = argv[2];
  if (notify_register_dispatch(argv[1], &token, dispatch_get_main_queue(), ^(int value) {
    FILE *file = fopen(path, "w");
    if (!file) exit(3);
    fputs("recording\n", file);
    fclose(file);
    notify_cancel(value);
    exit(0);
  }) != NOTIFY_STATUS_OK) return 4;
  // Parent starts Instruments only after registration is complete.
  puts("listening");
  fflush(stdout);
  alarm(50);
  dispatch_main();
}
