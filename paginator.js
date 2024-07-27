const jsonpointer = require('jsonpointer');


class Paginator {
    constructor(context, options = {}) {
        this.context = context;
        this.options = options;
    }

    newMethod(method, options = {}) {
        return new PaginatorMethod(this.context, method, {...this.options, ...options});
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