scoreboard players add @s nice_mob_variants.zombified.counter 1
particle effect{color:[1.000,0.000,0.000]} ~ ~.5 ~ 0.3 0.3 0.3 0 5

execute unless score @s nice_mob_variants.zombified.counter matches 30.. run return fail

execute if predicate nice_mob_variants:percentages/10 run data modify entity @s variant set value "nice_mob_variants:zombified"
tag @s add nice_mob_variants.zombified.done
scoreboard players reset @s nice_mob_variants.zombified.counter