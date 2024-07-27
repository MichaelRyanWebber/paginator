const jsonpointer = require('jsonpointer');


class Paginator {
    constructor(context, options = {}) {
        this.context = context;
        this.options = options;
    }

    async fetchAllPages(method, args, options = {}) {
        const requestOptions = {...this.options, ...options};
        method = method.bind(this.context);
        if (requestOptions.type === 'count') {
            return this._fetchCountBasedPages(method, args, requestOptions);
        } else if (requestOptions.type === 'token') {
            return this._fetchTokenBasedPages(method, args, requestOptions);
        } else {
            throw new Error('Invalid pagination type');
        }
    }

    async _fetchCountBasedPages(method, args, {initialArgs, resultsKey, offsetKey, countKey, isEmpty}) {
        let results = [];
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
            const response = await method({
                ...initialArgs,
                ...args,
                [offsetKey]: offset,
            });

            const pageResults = resultsKey ? response[resultsKey] : response;
            results = results.concat(pageResults);
            offset += pageResults.length;
            hasMore = offset < response[countKey] || pageResults.length === 0;
        }

        return results;
    }

    async _fetchTokenBasedPages(method, args, {initialArgs, resultsKey, tokenParam, tokenPath, isEmpty}) {
        let results = [];
        let token = null;
        let hasMore = true;

        while (hasMore) {
            const params = {...initialArgs, ...args};
            if (token) params[tokenParam] = token;

            const response = await method(params);
            const pageResults = response[resultsKey];
            results = results.concat(pageResults);

            token = jsonpointer.get(response, tokenPath); // Adjust path for jsonpointer
            hasMore = token !== undefined;
        }

        return results;
    }
}

class PaginatorMethod {
    constructor(context, method, options) {
        this.context = context;
        this.method = method.bind(context);
        this.reset(options);
    }

    reset(options = {}) {
        this.options = {...this.options, ...options};
        this.results = [];
        this.currentPage = null;
        this.nextPage = null;
        if (this.options.type === 'count') {
            this.offset = 0;
            this.getPagingArgs = () => ({[this.options.offsetKey] : this.offset});
            this.processResponse = (response) => this.offset += this.extractResults(response).length;
            this.hasMore = () => this.offset < this.currentPage[this.options.countKey];
        } else if (this.options.type === 'token') {
            this.token = null;
            this.getPagingArgs = () => this.token ? {[this.options.tokenParam]: this.token} : {};
            this.processResponse = (response) => this.token = jsonpointer.get(response, this.options.tokenPath);
            this.hasMore = ()=> this.token !== undefined;
        }
    }

    extractResults(response) {
        return response[this.options.resultsKey] ?? response;
    }

    getMethodArgs() {
        return {
            ...this.options.initialArgs,
            ...this.options.args,
            ...this.getPagingArgs(),
        }
    }

    async fetchNext() {
        const methodArgs = this.getMethodArgs();
        const response = await this.method(methodArgs);
        this.processResponse(response);
        this.currentPage = response;
        this.results = this.results.concat(this.extractResults(response));
        return response;
    }

    async fetchAllPages(args, options = {}) {
        this.reset(options);
        do {
            await this.fetchNext();
        } while (this.hasMore())
        return this.results;
    }

    async* fetchPagesGenerator() {
        do {
            const response = await this.fetchNext();
            yield this.extractResults(response);
        } while (this.hasMore());
    }

    async fetchPagesStream(args, options = {}) {
        this.reset(options);
        const generator = this.fetchPagesGenerator();
        return new ReadableStream({
            async start(controller) {
                for await (const page of generator) {
                    controller.enqueue(page);
                }
                controller.close();
            }
        });
    }
}

module.exports = {Paginator, PaginatorMethod};