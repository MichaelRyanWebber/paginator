const {connectToDatabase, disconnectFromDatabase, Auther} = require('@friggframework/core');
const {Definition} = require('@friggframework/api-module-hubspot');
const {Authenticator} = require('@friggframework/test');
const {Paginator, PaginatorMethod} = require('../paginator');

process.env.MONGO_URI = 'mongodb://localhost:27017/paginator';
const userId = '669a906fce46e377356627fa'

describe('HubSpot Paging Tests', () => {
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
        });
    });

    describe('Test paginator', () => {
        it('Retrieve page of contacts types', async () => {
            const results = await module.api.listContacts({after: 0});
            expect(results).toBeDefined();
        })

        it('Retrieve pages with paginator', async () => {
            const paginator = new Paginator(module.api,
                {
                    type: 'token',
                    tokenParam: 'after',
                    tokenPath: '/paging/next/after',
                    resultsKey: 'results',
                    initialArgs: { limit:100, after: 0 },
                });
            const results = await paginator.fetchAllPages(module.api.listContacts);
            expect(results).toBeDefined();
            expect(results.length).toBeGreaterThan(200);
        })

        it('Retrieve pages with PaginatorMethod', async () => {
            const pMethod = new PaginatorMethod(
                module.api,
                module.api.listContacts,
                {
                    type: 'token',
                    tokenParam: 'after',
                    tokenPath: '/paging/next/after',
                    resultsKey: 'results',
                    initialArgs: { limit:100, after: 0 },
                }
            );
            const results = await pMethod.fetchAllPages();
            expect(results).toBeDefined();
            expect(results.length).toBeGreaterThan(200);

            // test reset
            const newResults = await pMethod.fetchAllPages();
            expect(newResults).toBeDefined();
            expect(newResults.length).toEqual(results.length);
        })
    })
});
