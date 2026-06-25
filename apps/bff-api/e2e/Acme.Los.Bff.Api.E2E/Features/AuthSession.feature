Feature: BFF auth session API

  Scenario: Auth session can be read, touched, and cleared
    Given I have an authenticated BFF session for user "session-user-123" with email "session@example.com"
    When I read the BFF auth session
    Then the response status code should be OK
    And the auth session should be authenticated for user "session-user-123"
    When I touch the BFF auth session
    Then the response status code should be OK
    And the auth session touch should succeed
    When I request the BFF auth logout hint
    Then the response status code should be OK
    And the logout hint id token should be "id-token-123"
    When I clear the BFF auth session
    Then the response status code should be OK
    And the auth session should be unauthenticated
