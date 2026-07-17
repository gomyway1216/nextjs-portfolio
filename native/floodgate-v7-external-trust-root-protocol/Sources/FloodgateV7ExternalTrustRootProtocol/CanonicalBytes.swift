public enum CanonicalRecordError: Error, Equatable, Sendable {
    case invalidCanonicalRecord
}

public struct CanonicalBytes20: Equatable, Hashable, Comparable, Sendable {
    public let bytes: [UInt8]

    public init(_ bytes: [UInt8]) throws {
        guard bytes.count == 20 else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        self.bytes = Array(bytes)
    }

    static func unchecked(_ bytes: [UInt8]) -> Self {
        precondition(bytes.count == 20)
        return try! Self(bytes)
    }

    var isAllZero: Bool {
        bytes.allSatisfy { $0 == 0 }
    }

    public static func < (lhs: Self, rhs: Self) -> Bool {
        lhs.bytes.lexicographicallyPrecedes(rhs.bytes)
    }
}

public struct CanonicalBytes32: Equatable, Hashable, Comparable, Sendable {
    public let bytes: [UInt8]

    public init(_ bytes: [UInt8]) throws {
        guard bytes.count == 32 else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        self.bytes = Array(bytes)
    }

    static func unchecked(_ bytes: [UInt8]) -> Self {
        precondition(bytes.count == 32)
        return try! Self(bytes)
    }

    public static let zero = Self.unchecked(Array(repeating: 0, count: 32))

    var isAllZero: Bool {
        self == .zero
    }

    public static func < (lhs: Self, rhs: Self) -> Bool {
        lhs.bytes.lexicographicallyPrecedes(rhs.bytes)
    }
}

enum CanonicalSHA256 {
    private static let initialState: [UInt32] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]

    private static let roundConstants: [UInt32] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
        0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
        0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
        0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
        0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
        0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
        0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
        0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ]

    private static func rotateRight(_ value: UInt32, by amount: UInt32) -> UInt32 {
        (value >> amount) | (value << (32 - amount))
    }

    static func digest(_ input: [UInt8]) -> CanonicalBytes32 {
        precondition(UInt64(input.count) <= UInt64.max / 8)

        var message = Array(input)
        let trailingBlockCount = input.count % 64 <= 55 ? 1 : 2
        let (paddedBlockCount, blockCountOverflow) =
            (input.count / 64).addingReportingOverflow(trailingBlockCount)
        let (paddedLength, paddedLengthOverflow) =
            paddedBlockCount.multipliedReportingOverflow(by: 64)
        precondition(!blockCountOverflow && !paddedLengthOverflow)
        message.reserveCapacity(paddedLength)

        let bitLength = UInt64(message.count) * 8
        message.append(0x80)
        while message.count % 64 != 56 {
            message.append(0)
        }
        for shift in stride(from: 56, through: 0, by: -8) {
            message.append(UInt8(truncatingIfNeeded: bitLength >> UInt64(shift)))
        }

        var state = initialState
        var schedule = Array(repeating: UInt32(0), count: 64)

        for chunkStart in stride(from: 0, to: message.count, by: 64) {
            for index in 0..<16 {
                let offset = chunkStart + index * 4
                schedule[index] =
                    (UInt32(message[offset]) << 24)
                    | (UInt32(message[offset + 1]) << 16)
                    | (UInt32(message[offset + 2]) << 8)
                    | UInt32(message[offset + 3])
            }
            for index in 16..<64 {
                let previous15 = schedule[index - 15]
                let previous2 = schedule[index - 2]
                let sigma0 =
                    rotateRight(previous15, by: 7)
                    ^ rotateRight(previous15, by: 18)
                    ^ (previous15 >> 3)
                let sigma1 =
                    rotateRight(previous2, by: 17)
                    ^ rotateRight(previous2, by: 19)
                    ^ (previous2 >> 10)
                schedule[index] = schedule[index - 16]
                    &+ sigma0
                    &+ schedule[index - 7]
                    &+ sigma1
            }

            var a = state[0]
            var b = state[1]
            var c = state[2]
            var d = state[3]
            var e = state[4]
            var f = state[5]
            var g = state[6]
            var h = state[7]

            for index in 0..<64 {
                let upperSigma1 =
                    rotateRight(e, by: 6)
                    ^ rotateRight(e, by: 11)
                    ^ rotateRight(e, by: 25)
                let choice = (e & f) ^ ((~e) & g)
                let temporary1 = h
                    &+ upperSigma1
                    &+ choice
                    &+ roundConstants[index]
                    &+ schedule[index]
                let upperSigma0 =
                    rotateRight(a, by: 2)
                    ^ rotateRight(a, by: 13)
                    ^ rotateRight(a, by: 22)
                let majority = (a & b) ^ (a & c) ^ (b & c)
                let temporary2 = upperSigma0 &+ majority

                h = g
                g = f
                f = e
                e = d &+ temporary1
                d = c
                c = b
                b = a
                a = temporary1 &+ temporary2
            }

            state[0] = state[0] &+ a
            state[1] = state[1] &+ b
            state[2] = state[2] &+ c
            state[3] = state[3] &+ d
            state[4] = state[4] &+ e
            state[5] = state[5] &+ f
            state[6] = state[6] &+ g
            state[7] = state[7] &+ h
        }

        var output: [UInt8] = []
        output.reserveCapacity(32)
        for word in state {
            output.append(UInt8(truncatingIfNeeded: word >> 24))
            output.append(UInt8(truncatingIfNeeded: word >> 16))
            output.append(UInt8(truncatingIfNeeded: word >> 8))
            output.append(UInt8(truncatingIfNeeded: word))
        }
        return CanonicalBytes32.unchecked(output)
    }
}

struct CanonicalEncoder {
    private(set) var bytes: [UInt8] = []

    mutating func append(_ value: UInt8) {
        bytes.append(value)
    }

    mutating func append(_ value: UInt32) {
        bytes.append(UInt8(truncatingIfNeeded: value >> 24))
        bytes.append(UInt8(truncatingIfNeeded: value >> 16))
        bytes.append(UInt8(truncatingIfNeeded: value >> 8))
        bytes.append(UInt8(truncatingIfNeeded: value))
    }

    mutating func append(_ value: UInt64) {
        for shift in stride(from: 56, through: 0, by: -8) {
            bytes.append(UInt8(truncatingIfNeeded: value >> UInt64(shift)))
        }
    }

    mutating func append(_ value: [UInt8]) {
        bytes.append(contentsOf: value)
    }
}

struct CanonicalDecoder {
    private let bytes: [UInt8]
    private var cursor = 0

    init(_ bytes: [UInt8]) {
        self.bytes = Array(bytes)
    }

    mutating func readByte() throws -> UInt8 {
        guard cursor < bytes.count else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        defer { cursor += 1 }
        return bytes[cursor]
    }

    mutating func readUInt32() throws -> UInt32 {
        let value = try readBytes(count: 4)
        return
            (UInt32(value[0]) << 24)
            | (UInt32(value[1]) << 16)
            | (UInt32(value[2]) << 8)
            | UInt32(value[3])
    }

    mutating func readUInt64() throws -> UInt64 {
        let value = try readBytes(count: 8)
        return
            (UInt64(value[0]) << 56)
            | (UInt64(value[1]) << 48)
            | (UInt64(value[2]) << 40)
            | (UInt64(value[3]) << 32)
            | (UInt64(value[4]) << 24)
            | (UInt64(value[5]) << 16)
            | (UInt64(value[6]) << 8)
            | UInt64(value[7])
    }

    mutating func readBytes(count: Int) throws -> [UInt8] {
        guard count >= 0, count <= bytes.count - cursor else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        let start = cursor
        cursor += count
        return Array(bytes[start..<cursor])
    }

    var isAtEnd: Bool {
        cursor == bytes.count
    }
}
