import Foundation
import Darwin

// The descriptor deliberately survives exec. The Node repository owns the kernel
// lock until it exits, including crashes; the persistent file is never unlinked.
let arguments = CommandLine.arguments
func fail(_ message: String) -> Never {
    let data = try! JSONSerialization.data(withJSONObject: ["error": message])
    FileHandle.standardOutput.write(data + Data([10]))
    exit(1)
}
guard arguments.count >= 4 else { fail("本地服务启动参数无效") }
let descriptor = open(arguments[1], O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
guard descriptor >= 0 else { fail("无法打开本地数据锁。请检查目录权限。") }
guard flock(descriptor, LOCK_EX | LOCK_NB) == 0 else { fail("本地桌面已在另一个进程中打开。请先退出另一个 Sill 窗口。") }
let strings = arguments.dropFirst(2).map { strdup($0) }
var pointers = strings + [nil]
execv(arguments[2], &pointers)
fail("无法启动随包本地服务。请重新安装应用。")
