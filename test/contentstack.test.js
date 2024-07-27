const {connectToDatabase, disconnectFromDatabase, createObjectId, Auther} = require('@friggframework/core');
const {Definition} = require('@friggframework/api-module-contentstack');
const {Authenticator} = require('@friggframework/test');
const {Paginator, PaginatorMethod} = require('../paginator');

process.env.MONGO_URI = 'mongodb://localhost:27017/paginator';
const userId = '669a906fce46e377356627fa'

describe('Contentstack Paging Tests', () => {
    let module, authUrl;
    beforeAll(async () => {
        await connectToDatabase();
        module = await Auther.getInstance({
            definition: Definition,
            userId: userId,
        });
    });

    afterAll(async () => {
        await disconnectFromDatabase();
    });

    describe('Authorization requests', () => {
        it('Lookup existing entity', async () => {
            const modules = await module.getEntitiesForUserId(userId);
            if (modules.length === 0) {
                const {url} = await module.getAuthorizationRequirements();
                const response = await Authenticator.oauth2(url);
                await module.processAuthorizationCallback({
                    data: {
                        code: response.data.code,
                        location: response.data.location
                    },
                });

            } else {
                module = await Auther.getInstance({
                    userId: userId,
                    entityId: modules[0].id,
                    definition: Definition,
                });
                expect(module).toBeDefined();
                expect(module.entity).toBeDefined();
                expect(module.credential).toBeDefined();
                expect(await module.testAuth()).toBeTruthy();
            }
            module.api.setApiKey(module.credential.api_key)
        });
    });

    describe('Test paginator', () => {
        it('Retrieve page of content types', async () => {
            const results = await module.api.listContentTypes({include_count: true});
            expect(results).toBeDefined();
        })
        it.skip('Create test content types', async () => {
            const testSchema = {
                "title": "test1",
                "uid": "test1",
                "schema": [
                    {
                        "data_type": "text",
                        "display_name": "Title",
                        "mandatory": true,
                        "uid": "title",
                        "unique": true,
                        "multiple": false,
                        "non_localizable": false
                    },
                    {
                        "data_type": "text",
                        "display_name": "test",
                        "uid": "test",
                        "format": "",
                        "mandatory": false,
                        "multiple": false,
                        "non_localizable": false,
                        "unique": false
                    }
                ]
            }
            const count = 300;
            for (let i = 0; i < count; i++) {
                const name = `test${i}`
                const response = await module.api.createContentType({
                    content_type:
                        {...testSchema, title: name, description: name, uid: name}
                });
                expect(response).toBeDefined();
            }
        })

        it('Retrieve pages with PaginatorMethod', async () => {
            const pMethod = new PaginatorMethod(
                module.api,
                module.api.listContentTypes,
                {
                    type: 'count',
                    offsetKey: 'skip',
                    countKey: 'count',
                    initialArgs: {limit: 100, include_count: true},
                    resultsKey: 'content_types'
                }
            );
            const results = await pMethod.fetchAllPages();
            expect(results).toBeDefined();
            expect(results.length).toBeGreaterThan(200);
        })
        it('Retrieve pages with PaginatorMethod stream', async () => {
            const pMethod = new PaginatorMethod(
                module.api,
                module.api.listContentTypes,
                {
                    ...{
                        type: 'count',
                        offsetKey: 'skip',
                        countKey: 'count',
                        initialArgs: {limit: 100, include_count: true},
                    }, resultsKey: 'content_types'
                });
            const results = [];
            const stream = await pMethod.fetchPagesStream();
            const reader = stream.getReader();

            while (true) {
                const {value, done} = await reader.read();
                if (done) break;
                results.push(...value);
            }
            expect(results).toBeDefined();
            expect(results.length).toBeGreaterThan(200);

            // test reset
            const newStream = await pMethod.fetchPagesStream();
            const newReader = newStream.getReader();
            const newResults = [];
            while (true) {
                const {value, done} = await newReader.read();
                if (done) break;
                newResults.push(...value);
            }
            expect(newResults).toBeDefined();
            expect(newResults.length).toEqual(results.length);

        })
    })
});
