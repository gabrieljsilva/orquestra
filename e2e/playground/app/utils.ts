function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function* fibonacci(limit: number) {
	let [a, b] = [0, 1];
	while (a < limit) {
		yield a;
		[a, b] = [b, a + b];
	}
}

export async function retryUntil<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
	const fib = fibonacci(Number.MAX_SAFE_INTEGER);

	fib.next();

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (err) {
			if (attempt === maxRetries) {
				throw err;
			}
			const { value: waitSec } = fib.next();
			await sleep(((waitSec ?? 1) || 1) * 1000);
		}
	}
}
