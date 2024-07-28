const jsonpointer = require('jsonpointer');


class Paginator {
    constructor(context, defaultOptions = {}) {
        this.context = context;
        this.defaultOptions = defaultOptions;
    }

    newMethod(method, options = {}) {
        return new PaginatorMethod(this.context, method, {...this.defaultOptions, ...options});
    }
}

class PaginatorMethod {
    constructor(context, method, options) {
        this.method = method.bind(context);
        this.defaultOptions = options;
        this.reset(options);
    }

    reset(options = {}) {
        this.options = {...this.defaultOptions, ...options};
        this.args = {...this.defaultOptions.args, ...this.options.args};
        this.prefetch = Boolean(this.options.prefetch);
        this.results = [];
        this.currentPage = null;
        this.lastResults = null;
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

        this.extractResults = (response) => response[this.options.resultsKey] ?? response;
        this.getMethodArgs = () => ({...this.args, ...this.getPagingArgs()});
    }

    async fetchNext() {
        const methodArgs = this.getMethodArgs();
        const response = await this.method(methodArgs);
        this.processResponse(response);
        this.currentPage = response;
        return this.extractResults(response);
    }

    async fetchAllPages(options = {}) {
        this.reset(options);
        do {
            const results = await this.fetchNext();
            this.results = this.results.concat(results);
        } while (this.hasMore())
        return this.results;
    }

    async* fetchPagesGenerator() {
        do {
            if (this.prefetch && this.lastResults) {
                const resultsPromise = this.fetchNext();
                yield this.lastResults
                this.lastResults = await resultsPromise;
            } else {
                yield await this.fetchNext();
            }
        } while (this.hasMore());

        if (this.prefetch) {
            return this.lastResults;
        }
    }

    async fetchPagesStream(options = {}) {
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