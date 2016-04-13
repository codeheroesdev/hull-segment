## Getting Started

Once you’ve installed the Segment ship on your organization, turn on Hull from the Segment integrations page. Get your API Key from ship's settings page on Hull and add it to segment.

Hull supports the `identify`, `track`, and `group` methods.

### Identify

Every user identified on Segment with a `userId` will be created as a User on Hull.

Segment's `userId` will be mapped to Hull's `external_id` field.

#### First level user attributes

The following traits will be stored as first level fields on the User object

- address
- contact_email
- created_at
- description
- email
- first_name
- image
- last_name
- name
- phone
- picture
- username

#### Custom traits

All other traits from the `identify` call will be stored as [custom traits](http://www.hull.io/docs/references/hull_js/#traits) on Hull.

### Group

Each group call in Segment will apply the group's traits as traits on the users that belong to the group. Those group traits are prefixed with `group__`

For example:

      identify.group('123', { name: 'Wonderful', city: 'Paris' });

will add the following traits on all users that belong to the group :

      {
        group__id: '123',
        group__name: 'Wonderful',
        group__city: 'Paris'
      }

__Note: This feature is optional and not enabled by default. You should only be enabled if your users can only belong to one group.__

### Track

Every `track` in Segment will create a new Event on Hull.


## Publishing data back to Segment

When a user enters or leaves a Hull segment, this ship send a new `identify` call with the following traits :

    analytics.identify(userId, {
      hull_segments: #all matching segment names joined by a ','#
    })


