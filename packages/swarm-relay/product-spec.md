I want to create a library for microfrontend communication called "Swarm Relay". This library will facilitate communication between different microfrontends in a seamless and efficient manner.

The idea is I will uses SharedWorker to create a central communication hub that all microfrontends can connect to. This will allow for real-time communication and data sharing between the microfrontends without the need for complex APIs or server-side communication.

But I want to ensure that the library is strictly typed for the payload and event name to prevent any runtime errors.

To achieve this, I want the implementation / dev that implement this library can passes generics types for the event names and payloads. This way, we can enforce type safety and ensure that the communication between microfrontends is robust and error-free.

Here is a high-level overview of how the Swarm Relay library will work:

1. The library will create a SharedWorker that acts as a central communication hub for all microfrontends.
2. Each microfrontend will connect to the SharedWorker and register itself with a unique identifier via this library hooks / function if implemented in non components in React.
3. Microfrontends can send messages to each other by specifying the target microfrontend's identifier, the event name, and the payload. The library will ensure that the payload is of the correct type based on the generics provided during implementation.
4. The SharedWorker will handle the routing of messages between microfrontends, ensuring that messages are delivered to the correct recipients based on their identifiers. This works based on event name and payload type.
5. I want to implement hooks for component implementation and function for non-component implementation in React, allowing developers to easily integrate the Swarm Relay library into their microfrontends regardless of their architecture.
6. I want this swarm relay library implement class that abstracts the communication logic, so the part of using Service Worker as communication can easily be replaced with other communication mechanisms in the future if needed, without affecting the overall architecture of the library.
7. The library will also include error handling mechanisms to ensure that any issues with communication are properly logged and handled, preventing any disruptions in the microfrontend communication.
8. Finally, I want to provide comprehensive documentation and examples to help developers understand how to use the Swarm Relay library effectively in their microfrontend applications. This will include guides on setting up the SharedWorker, registering microfrontends, sending messages, and handling errors.

Don't forget to ensure that the library is designed in best practices and ease for adding unit test.
